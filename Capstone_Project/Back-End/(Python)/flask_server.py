import flask
import dotenv
import waitress
from os import environ
from routes.customer import customer_blueprint
from routes.employee import employee_blueprint
from routes.court import court_blueprint
from routes.reservation import reservation_blueprint
from datetime import timedelta
flask_server = flask.Flask(__name__)
dotenv.load_dotenv("backend_access.env")
flask_server.secret_key = environ["SECRET_KEY"]
flask_server.permanent_session_lifetime = timedelta(days=7)
# SameSite=Lax keeps the session cookie on same-site XHR/fetch (e.g. POST /api/reservation).
# Use the same SECRET_KEY on every EC2 instance so the cookie works behind a load balancer.
flask_server.config.update(SESSION_COOKIE_SAMESITE="Lax")
flask_server.register_blueprint(customer_blueprint)
flask_server.register_blueprint(employee_blueprint)
flask_server.register_blueprint(court_blueprint)
flask_server.register_blueprint(reservation_blueprint)
flask_server.debug=True

def get_server_status():
    return "Running"    

@flask_server.route('/status', methods=['GET'])
def check_status():
    current_status = get_server_status()
    return {"server_status": current_status}

if __name__ =="__main__":
    waitress.serve(flask_server,port=3001)
    


    