# Stock Rewards API

This project is a Node.js and Express-based API for managing stock rewards. It uses MongoDB as its database.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/try/download/community)

## Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-folder>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create a configuration file:**
    Create a file named `.env` in the root of the project and add the following content. This file stores the database connection string and the server port.

    ```
    MONGO_URI=mongodb://localhost:27017/stock-rewards
    PORT=3000
    ```

## Running the Application

1.  **Start your MongoDB service.**
    On Windows, you can do this from the command line:
    ```bash
    sc start MongoDB
    ```
    *Note: You may need to run this command in a terminal with administrator privileges.*

2.  **Start the server:**
    ```bash
    node index.js
    ```
    The server will start and be accessible at `http://localhost:3000`.

## Project Structure

The project follows a standard Model-View-Controller (MVC) like pattern:

-   `index.js`: The main entry point of the application. It initializes the Express server, connects to the MongoDB database, and sets up the middleware.
-   `.env`: Stores environment variables for configuration (e.g., database URI, port).
-   `package.json`: Lists project dependencies and scripts.
-   `models/`: Contains the Mongoose schemas that define the structure of the data in the MongoDB database.
-   `controllers/`: Holds the business logic. Functions here are responsible for processing requests and interacting with the models.
-   `routes/`: Defines the API endpoints (URIs) and maps them to the corresponding controller functions.

## API Endpoints

The following API endpoints are available:

-   `GET /`: A welcome message for the API.
-   `/api/rewards`: Routes for managing rewards.
-   `/api/stocks`: Routes for managing stocks.
--   `/api/users`: Routes for managing users.
+   `/api/users`: Routes for managing users.
