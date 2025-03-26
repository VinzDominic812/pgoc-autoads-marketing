# PGOC-MARKETING-AUTOMATION - Developer Notes

This documentation provides a step-by-step guide on setting up, running, and contributing to the **PGOC Marketing Automation** system, which consists of:

- **pgoc-adsbot-frontend** → The main React frontend web application
- **pgoc-autoads-api** → The Flask-based API running in Docker

---

## **1️⃣ Cloning the Source Code**

### **Step 1: Create a Project Folder**

Open a terminal (CMD, Git Bash, or any shell) and run:

```

mkdir pgoc-marketing-automation
cd pgoc-marketing-automation

```

### **Step 2: Clone the Repository**

```

git clone https://github.com/jmcanete-pgoc/fb-campaign-automation.git

```

> 🔹 Login to your GitHub account that has access to the repository before proceeding.
> 

---

## **2️⃣ Running the Frontend (`pgoc-adsbot-frontend`)**

### **Step 1: Navigate to the Frontend Directory**

```

cd pgoc-adsbot-frontend
```

### **Step 2: Create the `.env` File**

Create a `.env` file in the **pgoc-adsbot-frontend** directory and add the following content:

```

#### Development Server
VITE_API_URL="http://127.0.0.1:5095"
VITE_COOKIE_SECRET="@_pgocmarketing"

```

### **Step 3: Install Dependencies**

```
npm install
```

### **Step 4: Run the Development Server**

```

npm run dev
```

> 🔹 The frontend should now be running at http://localhost:5173 (default Vite port).
> 

---

## **3️⃣ Running the API (`pgoc-autoads-api`)**

### **Step 1: Navigate to the Backend Directory**

```
cd pgoc-autoads-api

```

### **Step 2: Create the `.env` File**

Create a `.env` file in the **pgoc-autoads-api** directory and add the following content:

```

# Development Server Configuration
export FLASK_RUN_PORT=5095
export FLASK_RUN_HOST=0.0.0.0
SECRET_KEY=pgoc_key

# Redis & Celery Configuration
REDIS_URL=redis://redisAds:6379/0
CELERY_BROKER_URL=redis://redisAds:6379/0
CELERY_RESULT_BACKEND=redis://redisAds:6379/0

# PostgreSQL Database Configuration
POSTGRES_HOST=postgresdb
POSTGRES_USER=pgoc_marketing_admin
POSTGRES_PASSWORD=@_AdsEncrypted2025
POSTGRES_DB=adsmarketing_users
POSTGRES_PORT=5432

# Email Configuration
RESET_SALT=your_unique_reset_salt_here
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=johnleonardburgos.pgoc@gmail.com
MAIL_PASSWORD=advs wlgw osnv xtxf
MAIL_USE_TLS=True
MAIL_USE_SSL=False

```

### **Step 3: Run the API in Docker**

```
docker compose up --build

```

> 🔹 If you want to run it in detached mode, use:
> 

```

docker compose up --build -d

```

---

## **4️⃣ Development Workflow**

### **Pull the Latest Changes**

Before making any changes, pull the latest updates:

```

git pull origin main

```

or if you're working on the **develop branch**:

```

git checkout develop_branch
git pull origin develop_branch

```

### **Creating a New Branch for Changes**

```
git branch <developer-name>
git checkout <developer-name>

```

### **Committing Changes**

```

git commit -m "<request/ticketID> - <your function or fix message>"

```

---

## **5️⃣ Summary of Commands**

| **Task** | **Command** |
| --- | --- |
| Clone Repository | `git clone https://github.com/jmcanete-pgoc/fb-campaign-automation.git` |
| Install Frontend Dependencies | `cd pgoc-adsbot-frontend && npm install` |
| Run Frontend | `npm run dev` |
| Create Backend `.env` | Add the provided environment variables |
| Run Backend in Docker | `docker compose up --build` |
| Run Backend in Detached Mode | `docker compose up --build -d` |
| Pull Latest Code | `git pull origin main` |
| Switch to Develop Branch | `git checkout develop_branch` |
| Create New Feature Branch | `git branch <developer-name> && git checkout <developer-name>` |
| Commit Changes | `git commit -m "<request/ticketID> - <your function or fix message>"` |

---

# Project Structure

## PGOC AUTOADS API

### **1. `app/` - Application Entry Point**

- The **main Python file** to start the API is inside the `app/` folder.
- It initializes the Flask application and runs it.

### **2. `worker/` - Celery Task Workers**

- Contains **Celery workers** for handling background tasks.
- `tasks.py` defines functions for:
    - Campaign creation
    - Turning campaigns on/off
    - Other long-running processes

### **3. `routes/` - Flask Blueprints & Endpoints**

- Contains all Flask **blueprints and endpoints**.
- Organizes API routes by functionality.

### **4. `controllers/` - Business Logic**

- Implements the core **business logic** for API endpoints.
- Each function here is used by routes.

### **5. `models/` - Database Schema**

- Contains `models.py`, which defines **PostgreSQL database schema**.

### **6. `config/` - Configuration Files**

- `celery-config.py` contains **Celery configuration settings**.

### **7. `Dockerfile.api` - API Container Setup**

- Used to build the **Docker image** for the API.

### **8. `docker-compose.yml` - App Deployment**

- Defines **multi-container deployment**, including:
    - Flask API
    - Celery worker
    - Redis broker
    - PostgreSQL database

### **9. `.gitignore` & `.dockerignore`**

- Prevents unnecessary files from being included in Git and Docker builds.

---

## **Running the Application**

### **Prerequisites**

- Install **Docker & Docker Compose** on your machine.

### **Start the Application**

Run the following command in the root directory:

```bash
docker compose up --build -d
```

This will:

- Build and start the **Flask API**
- Set up **Celery workers**
- Initialize **PostgreSQL** with persistent data

### **Stopping the Application**

```bash

docker compose down
```

This will shut down the running containers but **preserve PostgreSQL data**.

### **Restarting After Updates**

```bash

docker compose up --build -d
```

---

## **Database Persistence**

- PostgreSQL **data is persistent** across container restarts.
- Data will **only be lost if manually deleted**.

## **PGOC AdsBot Frontend - Project Structure Documentation**

## **Overview**

PGOC AdsBot Frontend is a **React-based** application built using **Vite** for fast development and performance. It utilizes **Tailwind CSS** for styling and manages authentication using **protected routes**. User data is stored in **cookies**, and the app is designed with a modular approach for reusability and scalability.

## **Project Structure**

### **1. `src/` - Main Application Code**

- `Router.tsx`: Defines all **routes** for the application.
- `protectedRoutes.jsx`: Implements **authentication-based route protection**.

### **2. `services/` - API Calls & Data Handling**

- Contains functions to **fetch user data** and interact with backend services.

### **3. `assets/` - Static Files**

- Stores **images** and other assets required for the frontend.

### **4. `pages/` - Organized UI Components**

- **`components/`**: **Reusable UI elements** (buttons, cards, sidebar).
- **`screens/`**: Main application screens, such as:
    - **Login & Signup** (User Authentication).
    - **Main Parent Screen** (Entry point of the app).
- **`segments/`**: Changeable UI sections that **appear in the sidebar or menu** (e.g., Dashboard).
- **`widgets/`**: Small **interactive components** used inside segments.

---

## **User Data Storage**

- User **data is stored in Cookies** to persist session details.

---

## **Running the Application**

### **1. Install Dependencies**

```bash
npm install
```

### **2. Start Development Server**

```bash
npm run dev
```

This will run the app locally on **Vite’s development server**.

### **3. Build for Deployment**

```bash
npm run build
```

- The build output will be placed inside the **`dist/` folder**.
- The contents of `dist/` can be **hosted on a web server**.

# **Deployment - Zrok Installation and Setup Tutorial**

## **Step 1: Install Zrok**

1. **Visit the Official Website:**
    
    Go to [https://zrok.io](https://zrok.io/) to download the latest Zrok CLI.
    
2. **Extract and Rename Folder**
    - Extract the downloaded ZIP file.
    - Rename the extracted folder to **`zrok-cli`**.
3. **Add to System PATH**
    - On **Windows**:
        1. Search for **Environment Variables** in the Start menu.
        2. Click **Edit the system environment variables**.
        3. In the **System Properties** window, click **Environment Variables**.
        4. Under **System Variables**, select **Path** and click **Edit**.
        5. Add a **New** entry with the path to the `zrok-cli` folder.
        6. Save and exit.
4. **Verify Installation**
    - Open **Command Prompt (cmd)** and type:
        
        ```bash
        zrok
        
        ```
        
    - If installed correctly, the Zrok CLI help menu will appear.

---

## **Step 2: Set Up Zrok Account**

1. **Invite Request**
    
    Run the following command:
    
    ```bash
    zrok invite
    
    ```
    
    - Provide your email when prompted.
    - Check your inbox and follow the link to create an account.
2. **Complete Account Setup**
    - Enter your password and log in.
3. **Enable Environment**
    - Click the **account dropdown (your email)** on the Zrok dashboard.
    - Select **Enable Environment** and copy the environment token.
4. **Activate Environment Token**
    
    ```bash
    zrok enable <token>
    
    ```
    

---

### **For Ubuntu/Linux**

- **Ubuntu:** Follow the official Docker installation

If using Linux, ensure you have a **personal access token** from the repository owner's GitHub account for authentication.

1. Download the Zrok binary for Linux.
2. Open the terminal in the download folder and run:
    
    ```
    mkdir /tmp/zrok && tar -xf ./zrok*linux*.tar.gz -C /tmp/zrok
    
    ```
    
3. Move the binary to a user-accessible location:
    
    ```
    mkdir -p ~/bin && install /tmp/zrok/zrok ~/bin/
    
    ```
    
4. Update the system path:
    
    ```
    export PATH=~/bin:$PATH
    
    ```
    

## **Step 3: Create a Reserve Token**

To reserve a public token for your local service:

```bash
zrok reserve public <http://127.0.0.1:5095> --unique-name "pgocmarketingv1.0"

```

---

## **Step 4: Share Reserved Token**

To share the reserved token:

```bash
zrok share reserved "pgocmarketingv1.0"

```

---

## **Step 5: Skip Interstitial Warning in Frontend**

To bypass the interstitial warning when accessing the shared service, set the following request header:

```json
{
  "skip_zrok_interstitial": "true"
}

```