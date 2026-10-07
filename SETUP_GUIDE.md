
# BlockBioVote Setup & Troubleshooting Guide

## Initial Setup

### 1. Database Initialization (REQUIRED)

Before running the backend for the first time, you must initialize the database:

```bash
cd server
npm run setup-db
```

This creates the required tables:
- `voters` - Voter registration data
- `candidates` - Election candidates  
- `audit_log` - Action audit trail

**If setup-db fails:**

#### Issue: "Cannot connect to database"
- Ensure MySQL is running:
  - **Windows**: Check Services or use `mysql -u root -p`
  - **Mac/Linux**: `brew services start mysql`
- Check credentials in `server/.env` match your MySQL setup

#### Issue: "Access denied"
- Verify `DB_USER` and `DB_PASSWORD` in `server/.env`
- Default: `root` user with password from `.env`

#### Alternative: Manual Setup
If `npm run setup-db` doesn't work, manually initialize:

```bash
mysql -u root -p < database/schema.sql
# When prompted, enter your MySQL password
```

### 2. Backend Setup

```bash
cd server
npm install
npm run setup-admin -- "your_admin_password"  # Setup admin user
npm run dev                                    # Start backend (development)
# OR
npm start                                      # Start backend (production)
```

The backend runs on `http://localhost:5000` (configured in `server/.env`)

### 3. Frontend Setup

```bash
cd client
npm install
npm run dev   # Development server (usually runs on http://localhost:5173)
```

### 4. Python AI Service (if using face verification)

```bash
cd python_ai
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py           # Runs on http://localhost:5001
```

**Key:** Ensure `PYTHON_AI_URL` in `server/.env` points to the AI service.

---

## Troubleshooting Registration Flow

### "Registration failed. Please try again" error

#### Check 1: Database Initialized?
Run the health check:
```bash
curl http://localhost:5000/api/health
```

Expected output:
```json
{
  "server": "ok",
  "database": "ok",
  "ai_service": "ok",
  "admin_login": "configured"
}
```

If `database` is "down":
1. Run `npm run setup-db` in the `server` directory
2. Check MySQL is running
3. Verify credentials in `server/.env`

#### Check 2: Backend Running?
- Backend should be running on port 5000
- Check terminal for errors: `node server.js`
- Look for error messages about database connections

#### Check 3: Frontend Connects to Backend?
- Check `client/src/api.js` has correct API URL (should be `http://localhost:5000/api`)
- Open browser DevTools → Network tab
- Click "Continue to Face Registration"
- Look for failed requests to `/api/voters/register`
- Check the response body for error details

#### Check 4: Database Connection
Test MySQL connection:
```bash
mysql -u root -p -e "SELECT * FROM securevoteai.voters LIMIT 1;"
```

If this fails:
- MySQL isn't running
- Credentials are wrong
- Database wasn't initialized with `npm run setup-db`

---

## Complete Error Messages

The backend now provides detailed error messages:

| Error Message | Cause | Solution |
|---|---|---|
| "Database is not initialized" | Tables don't exist | Run `npm run setup-db` |
| "Cannot connect to database" | MySQL offline or wrong credentials | Check MySQL is running, verify `.env` credentials |
| "Database authentication failed" | Wrong DB_USER or DB_PASSWORD | Update `server/.env` |
| "AI face service is unavailable" | Python AI service not running | Start Python AI service on port 5001 |
| "Cannot reach AI service" | Wrong PYTHON_AI_URL | Check `server/.env` `PYTHON_AI_URL` |

---

## Verification Steps

After setup, test the complete flow:

1. **Open Frontend**
   ```
   http://localhost:5173/voter/register
   ```

2. **Step 1 - Personal Details**
   - Fill in all fields
   - Click "Next →"

3. **Step 2 - OTP Verification**
   - Click "Send OTP" (generates demo OTP)
   - Enter the displayed OTP code
   - Click "Verify OTP"
   - Click "Continue to Face Registration →"

4. **Step 3 - Face Registration**
   - Browser requests camera permission
   - Camera preview appears
   - Capture 3-5 face images
   - Click "Register Face"

5. **Registration Complete**
   - Redirects to login page
   - Test voter login with registered Voter ID

If you get detailed error messages instead of "Registration failed. Please try again", that helps identify the exact issue.

---

## Port Configuration

| Service | Port | Environment Variable |
|---|---|---|
| Frontend (Vite) | 5173 | (none, starts automatically) |
| Backend (Node/Express) | 5000 | PORT in `server/.env` |
| AI Service (Python) | 5001 | PYTHON_AI_URL in `server/.env` |
| MySQL | 3306 | DB_HOST:DB_PORT in `server/.env` |

---

## Development vs Production

### Development
- Error messages include technical details
- Demo OTP shown in registration form
- Admin not required for basic testing

### Production
- Error messages are generic for security
- OTP integration with real SMS provider
- Admin login required
- Set `NODE_ENV=production` before deployment

---

## Still Having Issues?

1. Check all error messages in browser console (F12 → Console tab)
2. Check Node backend terminal for `register error:` messages
3. Run `curl http://localhost:5000/api/health` to verify all services
4. Ensure firewall allows local ports 5000, 5001, 5173
5. Try restarting all services in this order:
   - MySQL
   - Node backend
   - Python AI service
   - Frontend

