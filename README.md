# CIS-4375-Project - Capstone Project for CIS 4375
# Houston Badminton Center Reservation System
**Developed by SpiderWeave Consulting (Team 16)**

## SpiderWeave Consulting (Team 16)'s Member:
- Ken C. Vuong - Project Manager
- Nam Vu - Architect / Assistant Project Manager
- Dylan John Hayward -  Architect / Business Analyst
- Alek A. Espinosa -  Frontend / Lead Developer
- Ivan Oleh Pochynyuk - Backend / API Lead
- Joshua Sajan - Documentation Lead

**Canonical GitHub (production pulls on EC2):** [alek0412/Production](https://github.com/alek0412/Production)


## Project Overview
The Badminton Court Reservation System is a web-based platform developed for the Houston Badminton Center (Stafford, Texas). It provides a reliable scheduling workflow that allows customers to view court availability and reserve courts online in real-time, reducing manual coordination and booking conflicts.

## Features
* **Customer Portal:** Account registration, profile management, and waiver signing.
* **Court Reservations:** Real-time availability calendar, 30-min to 4-hour booking slots (15-min increments), and conflict prevention.
* **Memberships:** Support for Adult, Junior, and Senior membership tiers.
* **Admin Dashboard:** Staff tools to manage reservations, check-ins, block courts, and view reporting.
* **Payment Integration:** Secure checkout flow for bookings and memberships.

## Architecture & Tech Stack
This project uses a scalable, three-tier architecture:
* **Frontend:** HTML5, CSS3, JavaScript (Tab-based dynamic interface).
* **Middle Tier / Web Server:** Node.js (`server.js`) handles serving static files, session routing, and API proxying.
* **Backend API:** Python (Flask) utilizing Waitress (`flask_server.py`) for core business logic and routing.
* **Database & Cloud:** Designed for AWS DynamoDB (Production) and MySQL (Development), secured within an AWS VPC and routed via AWS Route 53.


## Installation & Setup - See `Capstone_Project/docs/CONSOLIDATED_DOCUMENTATION.md` for details how to config AWS services.
### Prerequisites
* Node.js (v14+)
* Python (3.8+)
* MySQL Server (for local development)

### 1. Backend API (Flask) Setup
1. Navigate to the Python backend directory: `cd Capstone_Project/Back-End/(Python)`
2. Install required Python packages (e.g., flask, waitress, python-dotenv) using `pip install requirements.txt`.
3. Create a `backend_access.env` file in this directory with your `SECRET_KEY` and database credentials.
4. Run the server: `python flask_server.py` (Runs on port 3001).

### 2. Middle Tier (Node.js) Setup
1. Navigate to the Node backend directory: `cd Capstone_Project/Back-End`
2. Install Node dependencies: `npm install`
3. Create a `.env` file based on `.env.example` (ensure your Flask proxy URL is set if needed).
4. Run the server: `node server.js` (Runs on port 3000).

### 3. Access the Application
* Open your browser and navigate to `http://localhost:3000`
* The application will redirect you to the public dashboard.

## Maintenance Log
Project active and monitored.
