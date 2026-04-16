import hashlib
import sql_functions
import datetime
from flask import request,make_response,Blueprint,session,jsonify
from os import urandom
from ssh_connection import secure_connection
from dateutil.relativedelta import relativedelta

customer_blueprint=Blueprint("customer",__name__,template_folder="templates")
sql_connection=secure_connection
@customer_blueprint.route("/api/waiver-register",methods=["post"])
def add_customer():
    request_json=request.get_json()
    try:
        first_name=request_json['first_name'].capitalize()
        last_name=request_json['last_name'].capitalize()
        phone=request_json['phone']
        email=request_json['email']
        street_address=request_json['street_address']
        city=request_json['city']
        state=request_json['state']
        zip_code=request_json['zip_code']
        birthdate=request_json['birthdate']
        password=request_json['password']
        emergency_first=request_json['emergency_first'].capitalize()
        emergency_last=request_json['emergency_last'].capitalize()
        relationship=request_json['relationship']
        emergency_phone=request_json['emergency_phone']
        emergency_email=request_json['emergency_email']
        query_tuple=(first_name,last_name,phone,email.lower(),street_address,city,state,zip_code)
        emergency_tuple=(emergency_first,emergency_last,relationship,emergency_phone,emergency_email)
    except (KeyError,TypeError):
        return make_response("Invalid parameters.",400)
    if emergency_phone==phone or emergency_email == email:
        make_response("You cannot have the same contact information for emergency contacts",400)
    email_check=sql_functions.execute_read(sql_connection,"Select email from customer;")
    try:
        for database_email in email_check:
            if database_email['email'].lower() == email:
                return make_response("Email already exists",400)
    except TypeError:
        return make_response("Server is unable to validate email",503)
    membership_difference=relativedelta(datetime.datetime.today(),datetime.datetime.strptime(birthdate,"%Y-%m-%d"))
    if membership_difference.years<23:
        query_tuple+=(1,birthdate)
    elif membership_difference.years>23 and membership_difference.years<55:
        query_tuple+=(2,birthdate)
    else:
        query_tuple+=(3,birthdate)
    salt=urandom(20)
    password_hash=hashlib.pbkdf2_hmac('sha256',password.encode(encoding='utf-8'),salt,50000)
    salted_password=password_hash.hex()
    updated_salt=salt.hex()
    query_tuple+=(salted_password,updated_salt)
    user_query="insert into customer(customer_first_name,customer_last_name,phone,email,street_address,city,state,zip_code,membership_status,birthdate,password,salt) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);"
    emergency_query="insert into emergency_contact(emergency_first,emergency_last,relationship,emergency_phone,emergency_email,customer_id) values(%s,%s,%s,%s,%s,%s);"
    create_query=sql_functions.execute_query(sql_connection,user_query,query_tuple)
    if type(create_query)==int:
        return make_response("Server is unable to create customer",503)
    customer_id=sql_functions.execute_read(sql_connection,"Select customer_id from customer where email = %s;",(email,))
    if type(customer_id)==int:
        return make_response("Server is unable to fetch customer",503)
    # waiver_status: 1 = Available to book, 2 = Pending / hold (active reservation) — see reservation.py
    waiver_query=sql_functions.execute_query(sql_connection,"insert into waiver (customer_id,waiver_status) values(%s,%s);",(customer_id[0]['customer_id'],1))
    if type(waiver_query)==int:
        return make_response("Server is unable to create waiver",503)
    emergency_execute=sql_functions.execute_query(sql_connection,emergency_query,emergency_tuple+(customer_id[0]['customer_id'],))
    if type(emergency_execute)==int:
        return make_response("Server is unable to create emergency contact",503)
    wid_rows = sql_functions.execute_read(
        sql_connection,
        "select waiver_id from waiver where customer_id=%s order by waiver_id desc limit 1",
        (customer_id[0]['customer_id'],),
    )
    if type(wid_rows) == int or not wid_rows:
        return make_response("Server is unable to fetch waiver id", 503)
    new_waiver_id = wid_rows[0]["waiver_id"]
    add_waiver_id = sql_functions.execute_query(
        sql_connection,
        "update customer set waiver_id=%s where customer_id=%s",
        (new_waiver_id, customer_id[0]['customer_id']),
    )
    if type(add_waiver_id)==int:
        return make_response("Server is unable to create waiver id",503)
    # Same Flask session as customer-login so POST /api/reservation sees is_customer (reservation.py).
    cust_rows = sql_functions.execute_read(
        sql_connection,
        "select * from customer where customer_id = %s",
        (customer_id[0]["customer_id"],),
    )
    if type(cust_rows) == int or not cust_rows:
        return make_response("Server is unable to fetch customer for session", 503)
    row = cust_rows[0]
    session.clear()
    for attribute in row:
        if attribute not in ["password", "salt"]:
            session[attribute] = row[attribute]
    session["password"] = password
    session["is_employee"] = False
    session["is_manager"] = False
    session["is_customer"] = True
    session["waiver_id"] = new_waiver_id
    return make_response("Customer created successfully!", 201)


@customer_blueprint.route("/api/customer-login",methods=["post"])
def customer_login():
    request_json=request.get_json()
    try:
        email=request_json['email']
        password=request_json['password']
    except KeyError:
        return make_response("Missing required parameters.",400)
    customer_query=sql_functions.execute_read(sql_connection,"select * from customer where email = %s",(email,))
    if type(customer_query)==int:
        return make_response("Server is unable to get anything",503)
    elif len(customer_query)==0:
        return make_response("Server cannot find your email",400)
    hashed_password=hashlib.pbkdf2_hmac('sha256',password.encode(encoding='utf-8'),bytes.fromhex(customer_query[0]['salt']),50000).hex()
    if hashed_password!=customer_query[0]['password'] or email.lower() != customer_query[0]['email']:
        return make_response("Invalid email or password",401)
    #Purge employee in session
    session.clear()
    for attribute in customer_query[0]:
        if attribute not in ["password","salt"]:
            session[attribute]=customer_query[0][attribute]
    session['password']=request_json['password']
    session['is_employee']=False
    session['is_manager']=False
    session['is_customer']=True
    # Point session at the real waiver row (fixes legacy rows where customer.waiver_id was set incorrectly).
    cid = session.get("customer_id")
    if cid is not None:
        wrows = sql_functions.execute_read(
            sql_connection,
            "select waiver_id from waiver where customer_id=%s order by waiver_id desc limit 1",
            (cid,),
        )
        if type(wrows) != int and wrows and len(wrows):
            session["waiver_id"] = wrows[0]["waiver_id"]
    return make_response("Login successful!",200)

@customer_blueprint.route("/api/customer-logout",methods=['post'])    
def customer_logout():
    session.clear()
    return make_response("Successfully logged out!",200)

@customer_blueprint.route("/api/customer-me", methods=["GET"])
def customer_me_get():
    if not session.get("is_customer") or "customer_id" not in session:
        return jsonify({"loggedIn": False}), 200

    def as_str(val):
        if val is None:
            return ""
        if hasattr(val, "isoformat"):
            return val.isoformat()
        return str(val)

    emergency_contact = None
    cid = session.get("customer_id")
    if cid is not None:
        try:
            ec_rows = sql_functions.execute_read(
                sql_connection,
                "select emergency_first, emergency_last, relationship, emergency_phone, emergency_email from emergency_contact where customer_id=%s limit 1",
                (cid,),
            )
            if type(ec_rows) != int and ec_rows and len(ec_rows) > 0:
                er = ec_rows[0]
                emergency_contact = {
                    "firstName": as_str(er.get("emergency_first")),
                    "lastName": as_str(er.get("emergency_last")),
                    "relationship": as_str(er.get("relationship")),
                    "phone": as_str(er.get("emergency_phone")),
                    "email": as_str(er.get("emergency_email")),
                }
        except (TypeError, KeyError, IndexError):
            emergency_contact = None

    fn = as_str(session.get("customer_first_name")).strip()
    ln = as_str(session.get("customer_last_name")).strip()
    if cid is not None:
        name_rows = sql_functions.execute_read(
            sql_connection,
            "select customer_first_name, customer_last_name from customer where customer_id=%s limit 1",
            (cid,),
        )
        if type(name_rows) != int and name_rows and len(name_rows) > 0:
            nr = name_rows[0]
            db_fn = as_str(nr.get("customer_first_name")).strip()
            db_ln = as_str(nr.get("customer_last_name")).strip()
            if db_fn:
                fn = db_fn
            if db_ln:
                ln = db_ln

    profile = {
        "customerId": session.get("customer_id"),
        "firstName": fn,
        "lastName": ln,
        "email": as_str(session.get("email")),
        "phone": as_str(session.get("phone")),
        "streetAddress": as_str(session.get("street_address")),
        "city": as_str(session.get("city")),
        "state": as_str(session.get("state")),
        "zipCode": as_str(session.get("zip_code")),
        "membershipStatus": session.get("membership_status"),
        "birthdate": as_str(session.get("birthdate")),
    }
    if emergency_contact is not None:
        profile["emergencyContact"] = emergency_contact

    return jsonify({"loggedIn": True, "profile": profile}), 200

@customer_blueprint.route("/api/customer",methods=['delete'])
def customer_remove():
    # DELETE may omit body/Content-Type; force/silent avoids 415 from get_json()
    request_json = request.get_json(force=True, silent=True) or {}
    session_id=session.get("customer_id")
    if not session.get("customer_id") and not request_json.get("customer_id"):
        return make_response("Invalid customer to delete",400)
    elif not session.get("is_employee") and not session.get("is_customer"):
        return make_response("Authorization required for deleting customer",401)
    try:
        customer_id=session_id if session_id else request_json.get("customer_id")
    except ValueError:
        return make_response("Invalid customer",400)
    delete_emergency=sql_functions.execute_query(sql_connection,"delete from emergency_contact where customer_id = %s",(customer_id,))
    if type(delete_emergency)==int:
        return make_response("Unable to delete emergency contacts",503)
    delete_reservations=sql_functions.execute_query(sql_connection,"delete from reservation where customer_id =%s",(customer_id,))
    if type(delete_reservations)==int:
        return make_response("Unable to delete from reservations",503)
    # Clear FK link first so waiver rows can be removed safely.
    clear_customer_waiver=sql_functions.execute_query(sql_connection,"update customer set waiver_id=NULL where customer_id=%s",(customer_id,))
    if type(clear_customer_waiver)==int:
        return make_response("Unable to clear customer waiver link",503)
    delete_waiver=sql_functions.execute_query(sql_connection,"delete from waiver where customer_id = %s",(customer_id,))
    if type(delete_waiver)==int:
        return make_response("Unable to delete from waiver",503)
    delete_customer=sql_functions.execute_query(sql_connection,"delete from customer where customer_id=%s",(customer_id,))
    if type(delete_customer)==int:
        return make_response("Unable to delete customer",503)
    session.clear()
    return make_response("Successfully deleted customer!",200)    

@customer_blueprint.route("/api/customer",methods=['patch'])
def update_details():
    if not session.get("is_customer") or "email" not in session:
        return make_response("Unauthorized", 401)
    request_json = request.get_json()
    if not request_json:
        return make_response("Invalid request", 400)

    email_where = session["email"]
    text_map = [
        ("first_name", "customer_first_name", "customer_first_name"),
        ("last_name", "customer_last_name", "customer_last_name"),
        ("email", "email", "email"),
        ("phone", "phone", "phone"),
        ("street_address", "street_address", "street_address"),
        ("city", "city", "city"),
        ("state", "state", "state"),
        ("zip_code", "zip_code", "zip_code"),
    ]
    for json_key, col, sess_key in text_map:
        if json_key not in request_json:
            continue
        new_val = request_json[json_key]
        old_val = session.get(sess_key)
        if new_val == old_val:
            continue
        q = sql_functions.execute_query(
            sql_connection,
            f"UPDATE customer SET {col}=%s WHERE email=%s",
            (new_val, email_where),
        )
        if type(q) == int:
            return make_response(f"Unable to update {json_key}", 503)
        session[sess_key] = new_val
        if json_key == "email":
            email_where = new_val

    if "password" in request_json and request_json["password"]:
        new_salt = urandom(20)
        new_password = hashlib.pbkdf2_hmac(
            "sha256", str(request_json["password"]).encode("utf-8"), new_salt, 50000
        ).hex()
        new_salt_hex = new_salt.hex()
        pq = sql_functions.execute_query(
            sql_connection,
            "UPDATE customer SET password=%s, salt=%s WHERE email=%s",
            (new_password, new_salt_hex, email_where),
        )
        if type(pq) == int:
            return make_response("Unable to update password", 503)

    session.modified = True
    return make_response("Successfully updated customer!", 200)
