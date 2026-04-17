from flask import jsonify, request, make_response, Blueprint, session
from ssh_connection import secure_connection
import sql_functions
import datetime
import pytz
reservation_blueprint = Blueprint("reservation", __name__, template_folder="templates")
times = {
    "weekday": {
        "starting": datetime.datetime.strptime("10:00", "%H:%M"),
        "closing": datetime.datetime.strptime("23:30", "%H:%M"),
    },
    "saturday": {
        "starting": datetime.datetime.strptime("08:00", "%H:%M"),
        "closing": datetime.datetime.strptime("23:30", "%H:%M"),
    },
    "sunday": {
        "starting": datetime.datetime.strptime("08:00", "%H:%M"),
        "closing": datetime.datetime.strptime("22:30", "%H:%M"),
    },
}
valid_end_times = ["00", "15", "30", "45"]
central_time=pytz.timezone("US/Central")

def _date_to_py_date(val):
    if val is None:
        raise ValueError("missing date")
    if isinstance(val, datetime.datetime):
        return val.date()
    if isinstance(val, datetime.date):
        return val
    s = str(val).strip()
    return datetime.datetime.strptime(s[:10], "%Y-%m-%d").date()


def _reservation_end_datetime_central(reservation_date, end_time_raw):
    """End instant of the reservation in US/Central (aware datetime)."""
    d = _date_to_py_date(reservation_date)
    end_base = _time_to_base_dt(end_time_raw)
    naive = datetime.datetime.combine(d, end_base.time())
    return central_time.localize(naive, is_dst=None)


def _latest_active_end_same_court(customer_id, court_id):
    """
    Latest end instant (US/Central) among this customer's pending (1) or confirmed (2) reservations
    on this court that have not ended yet. None if they may book this court again now.
    Returns (end_dt_or_none, query_ok). query_ok False means DB error.
    """
    rows = sql_functions.execute_read(
        secure_connection,
        "select reservation_date, reservation_end_time from reservation where customer_id=%s and court_id=%s and reservation_status in (1,2)",
        (customer_id, court_id),
    )
    if type(rows) == int:
        return (None, False)
    now_ct = datetime.datetime.now(tz=central_time)
    latest = None
    for row in rows:
        try:
            end_ct = _reservation_end_datetime_central(
                row["reservation_date"], row["reservation_end_time"]
            )
        except (ValueError, KeyError, TypeError):
            continue
        if now_ct < end_ct:
            if latest is None or end_ct > latest:
                latest = end_ct
    return (latest, True)


def _time_to_base_dt(val):
    """Normalize MySQL TIME (often timedelta), datetime, or 'HH:MM' string for comparisons."""
    if val is None:
        raise ValueError("missing time")
    if isinstance(val, datetime.timedelta):
        secs = int(val.total_seconds()) % 86400
        h, rem = divmod(secs, 3600)
        m = rem // 60
        # Keep same base date as strptime("%H:%M") => 1900-01-01, so datetime comparisons are valid.
        return datetime.datetime(1900, 1, 1, int(h), int(m))
    if isinstance(val, datetime.datetime):
        return val.replace(year=1900, month=1, day=1, second=0, microsecond=0)
    s = str(val).strip()
    if len(s) >= 5 and s[2] == ":":
        return datetime.datetime.strptime(s[:5], "%H:%M")
    raise ValueError("unrecognized time value")


@reservation_blueprint.route("/api/reservation", methods=["post"])
def add_reservation():
    request_json = request.get_json(force=True, silent=True) or {}
    is_valid_start = False
    is_valid_end = False
    if not session.get("is_customer"):
        return make_response("You must be a customer to reserve", 401)
    try:
        court = request_json["court_id"]
        customer = session["customer_id"]
        waiver = session["waiver_id"]
        reservation_date = request_json["reservation_date"]
        start_time = request_json["reservation_start_time"]
        end_time = request_json["reservation_end_time"]
        if type(court) != int or type(customer) != int or type(waiver) != int:
            return make_response("Invalid parameters", 400)
        query_tuple = (court, customer, waiver, reservation_date, start_time, end_time, 1)
    except KeyError:
        return make_response("Invalid parameters", 400)
    try:
        reservation_conversion = datetime.datetime.strptime(reservation_date, "%Y-%m-%d")
        start_time_conversion = datetime.datetime.strptime(start_time, "%H:%M")
        end_time_conversion = datetime.datetime.strptime(end_time, "%H:%M")
        today_d = datetime.datetime.now(tz=central_time)
        req_d = datetime.datetime.strptime(f"{reservation_date} {start_time}", "%Y-%m-%d %H:%M").replace(tzinfo=central_time)
        total_seconds = int((req_d - today_d).total_seconds())
        if total_seconds<=0 or total_seconds>(14*24*60*60):
            return make_response("Unable to reserve in past or reserve for more than 14 days.", 400)
        reservation_day_type = reservation_conversion.weekday()
        # Monday=0 … Sunday=6
        if reservation_day_type < 5:
            day_type = "weekday"
        elif reservation_day_type == 5:
            day_type = "saturday"
        else:
            day_type = "sunday"
        close_key = "closing"
        if (start_time_conversion - times[day_type]["starting"]).total_seconds() < 0 or (
            end_time_conversion - times[day_type][close_key]
        ).total_seconds() > 0:
            return make_response("Cannot reserve outside of business hours", 400)
        elif (end_time_conversion - start_time_conversion).total_seconds() > (60 * 60 * 4.5):
            return make_response("Cannot reserve for more than 4.5 hours", 400)
        elif (end_time_conversion - start_time_conversion).total_seconds() < (60 * 15):
            return make_response("Cannot reserve for less than 15 minutes", 400)
        for timestamp in valid_end_times:
            if start_time.endswith(timestamp):
                is_valid_start = True
            if end_time.endswith(timestamp):
                is_valid_end = True
        if not is_valid_start or not is_valid_end:
            return make_response("All times must end with a multiple of 15 minutes", 400)
    except (ValueError, TypeError):
        return make_response("Invalid date format", 400)

    reserved_court_values = sql_functions.execute_read(
        secure_connection,
        "select reservation_start_time, reservation_end_time from reservation where court_id=%s and reservation_date=%s and reservation_status in (1,2)",
        (court, reservation_date),
    )
    if type(reserved_court_values) == int:
        return make_response("Unable to fetch court times", 503)
    for row in reserved_court_values:
        court_booking_start = _time_to_base_dt(row["reservation_start_time"])
        court_booking_end = _time_to_base_dt(row["reservation_end_time"])
        if start_time_conversion < court_booking_end and end_time_conversion > court_booking_start:
            return make_response("Court is already booked", 400)

    # Same court only: cannot book this court again until the customer's current booking on it ends
    # (other courts are still allowed). Pending + confirmed count until end time passes.
    latest_end, ok_same = _latest_active_end_same_court(customer, court)
    if not ok_same:
        return make_response("Server is unable to verify reservations", 503)
    if latest_end is not None:
        until = latest_end.strftime("%b %d, %Y %I:%M %p %Z")
        return make_response(
            "You already have an active reservation on Court "
            + str(court)
            + " until "
            + until
            + ". You can request another time on this court after that ends, or ask staff for help.",
            400,
        )

    # waiver_status: 1 = Available, 2 = Hold while request exists. No active reservation (1,2) ⇒ allow book;
    # reset waiver rows so deny/delete drift cannot block the next request.
    sql_functions.execute_query(
        secure_connection,
        "update waiver set waiver_status=1 where customer_id=%s",
        (customer,),
    )
    sql_functions.execute_query(
        secure_connection,
        "update waiver set waiver_status=1 where waiver_id=%s and customer_id=%s",
        (waiver, customer),
    )

    customer_availability = sql_functions.execute_read(
        secure_connection,
        "select waiver_id from waiver where waiver_id=%s and customer_id=%s",
        (waiver, customer),
    )
    if type(customer_availability) == int:
        return make_response("Server is unable to fetch waiver", 503)
    if not customer_availability:
        return make_response(
            "Session is out of date; please log out and log in again, then try reserving.",
            400,
        )
    reservation_create = sql_functions.execute_query(
        secure_connection,
        "insert into reservation(court_id,customer_id,waiver_id,reservation_date,reservation_start_time,reservation_end_time,reservation_status) values(%s,%s,%s,%s,%s,%s,%s)",
        query_tuple,
    )
    if type(reservation_create) == int:
        return make_response("Server is unable to create reservation", 503)
    customer_update = sql_functions.execute_query(
        secure_connection, "update waiver set waiver_status=2 where waiver_id=%s", (waiver,)
    )
    if type(customer_update) == int:
        return make_response("Server is unable to update customer", 503)
    return make_response(
        "Reservation is now pending, please wait for staff to approve or deny your request...", 201
    )

def validate_reservation_keys(data):
    return "id" in data

@reservation_blueprint.route("/api/reservation", methods=["get"])
def get_reservation():
    pending_reservations = sql_functions.execute_read(
        secure_connection, "select * from reservation where reservation_status=1"
    )
    if type(pending_reservations) == int:
        return make_response("Unable to fetch pending reservations", 503)
    return jsonify(pending_reservations)


@reservation_blueprint.route("/api/reservation", methods=["patch"])
def reservation_approval():
    request_json = request.get_json()
    if not request_json:
        return make_response("Invalid request", 400)
    try:
        reservation_id = request_json["reservation_id"]
        reservation_status = request_json["reservation_status"]
    except KeyError:
        return make_response("Missing reservation parameters", 400)
    if not session.get("is_employee"):
        return make_response("Invalid authorization for approval", 401)
    if type(reservation_id) != int or type(reservation_status) != int:
        return make_response("Invalid reservation parameters", 400)
    reservation_fetch = sql_functions.execute_read(
        secure_connection,
        "select reservation_status, customer_id from reservation where reservation_id=%s",
        (reservation_id,),
    )
    if type(reservation_fetch) == int:
        return make_response("Server cannot fetch reservation", 503)
    current = reservation_fetch[0]["reservation_status"]
    if current == 1 and reservation_status not in (2, 3):
        return make_response("Cannot perform this action on a pending reservation", 400)
    if current == 2 and reservation_status != 4:
        return make_response("Cannot perform this action on an approved reservation", 400)
    if current not in (1, 2):
        return make_response("Cannot perform this action on this reservation", 400)
    reservation_update = sql_functions.execute_query(
        secure_connection,
        "update reservation set reservation_status=%s,employee_id=%s where reservation_id=%s",
        (reservation_status, session["employee_id"], reservation_id),
    )

    if type(reservation_update) == int:
        return make_response("Server cannot update reservation", 503)
    if reservation_status == 2:
        # Approved: still one active booking — keep waiver at 2 (Pending/hold per DB spec).
        update_customer = sql_functions.execute_query(
            secure_connection,
            "update waiver set waiver_status=2 where customer_id=%s",
            (reservation_fetch[0]["customer_id"],),
        )
        if type(update_customer) == int:
            return make_response("Server is unable to update customer", 503)
    #If employee denies or cancels reservation
    elif reservation_status in [3,4]:
        update_customer = sql_functions.execute_query(secure_connection,"update waiver set waiver_status=1 where customer_id=%s",(reservation_fetch[0]["customer_id"],))
        if type(update_customer) == int:
            return make_response("Server is unable to update customer", 503)
    if current == 1:
        verb = "approved" if reservation_status == 2 else "denied"
    else:
        verb = "cancelled"
    return make_response(f"Successfully {verb} reservation!", 201)

