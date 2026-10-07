# Registration Flow Debugging Guide

## Registration Flow Architecture

```
Frontend (React)
├── Step 1: Personal Details (local validation only)
├── Step 2: OTP Verification (local only - demo OTP)
│
└── "Continue to Face Registration" button
    │
    └─→ POST /api/voters/register  [FIRST BACKEND CALL]
        │
        ├─→ Backend validation
        ├─→ Database check
        ├─→ INSERT into voters table
        │
        ├─→ Success: { success: true, voter_id, message }
        │   └─→ Frontend navigates to Step 3
        │
        └─→ Error: { success: false, message: "..." }
            └─→ Frontend displays error message
```

## Common Issues & Debugging

### Issue #1: "Registration failed. Please try again"

This generic error occurs when the backend catches an exception. To diagnose:

#### Step 1: Check Backend Logs
When you click "Continue to Face Registration", watch your Node/Express terminal.

You should see one of these:

```
// Success
✅ Voter registration created

// Database not found
register error: Table 'securevoteai.voters' doesn't exist
Solution: Run `npm run setup-db`

// Connection refused
register error: connect ECONNREFUSED 127.0.0.1:3306
Solution: Ensure MySQL is running

// Authentication failed
register error: Access denied for user 'root'@'localhost'
Solution: Check DB credentials in server/.env
```

#### Step 2: Check Browser Network Tab
1. Open DevTools (F12 → Network tab)
2. Clear network history
3. Fill registration form
4. Send OTP and verify
5. Click "Continue to Face Registration"
6. Look for request to `localhost:5000/api/voters/register`
7. Check:
   - **Status Code**: Should be 200 or 201 (not 500)
   - **Request Body**: Verify voter_id, name, age, gender, address are sent
   - **Response Body**: Should show `{ success: true, ... }` or detailed error message

#### Step 3: Test API Directly
```bash
# Test the /register endpoint directly

curl -X POST http://localhost:5000/api/voters/register \
  -H "Content-Type: application/json" \
  -d '{
    "voter_id": "TEST001",
    "name": "Test Voter",
    "age": 25,
    "gender": "Male",
    "address": "Test Address",
    "mobile": "+91 98765 43210",
    "aadhaar": "123456789012"
  }'
```

Expected success response:
```json
{
  "success": true,
  "voter_id": "TEST001",
  "message": "Voter Test Voter registered. Now capture the face."
}
```

---

### Issue #2: Database Table Exists but Query Fails

#### Symptom
Backend starts but registration fails with database errors.

#### Debug Steps

1. **Verify table structure:**
```bash
mysql -u root -p -e "
  USE securevoteai;
  DESCRIBE voters;
"
```

Should show columns:
- voter_id (VARCHAR(20), PRIMARY KEY)
- name (VARCHAR(100), NOT NULL)
- age (INT, NOT NULL)
- gender (VARCHAR(10))
- address (TEXT)
- face_encoding (LONGTEXT)
- is_eligible (BOOLEAN)
- registered_at (TIMESTAMP)

2. **Check if data can be inserted manually:**
```bash
mysql -u root -p -e "
  USE securevoteai;
  INSERT INTO voters (voter_id, name, age, gender, address, is_eligible) 
  VALUES ('DEBUG001', 'Debug User', 25, 'Male', 'Test', TRUE);
  SELECT * FROM voters WHERE voter_id='DEBUG001';
"
```

3. **Check permissions:**
```bash
mysql -u root -p -e "
  SHOW GRANTS FOR 'root'@'localhost';
"
```

Should allow INSERT, UPDATE, SELECT on securevoteai database.

---

### Issue #3: Frontend Shows Success But Never Reaches Face Registration

#### Symptom
"Registration details saved" message appears, but Step 3 (Face Registration) doesn't load.

#### Cause
Backend is returning `success: true`, but frontend state isn't updating properly.

#### Debug
Open browser console (F12 → Console) and manually check:
```javascript
// Should show the response from backend
console.log('Last API response:', window.lastResponse);

// Check if step state is updating
// In React DevTools, check the step state
```

#### Fix
This should not happen with current code. If it does, try:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Restart frontend server
3. Reload page

---

### Issue #4: Validation Errors

Backend returns one of these errors:

```json
{
  "success": false,
  "message": "Voter ID must be 4-20 letters, digits or hyphens"
}
```

**Solutions:**

| Error | Cause | Fix |
|---|---|---|
| Voter ID must be 4-20 letters, digits or hyphens | voter_id is too short, too long, or has invalid chars | Use format: V001, VOTER-2025, etc (alphanumeric + hyphens only) |
| Enter the voter's full name (2-100 characters) | name is too short, too long, or empty | Use full name, min 2 chars |
| Enter a valid age | age is not an integer or < 1 or > 120 | Must be 18-120 |
| Address is too long | address exceeds 500 characters | Shorten address |
| Voter ID already registered | This voter_id is already in database | Use different voter_id |
| Must be 18 or older to register | age < 18 | Must be 18+ |

---

### Issue #5: Face Registration Opens But Camera Doesn't Work

#### Symptom
Step 3 shows but no camera preview, or "Camera unavailable" message.

#### Cause
Browser doesn't have camera permission.

#### Fix
1. Check browser permission:
   - Chrome: Settings → Privacy → Camera
   - Firefox: Preferences → Privacy → Permissions → Camera
2. Remove BlockBioVote from existing permissions
3. Reload page
4. Grant camera permission when prompted

---

## Network Flow Diagram

```
Frontend Request:
POST http://localhost:5000/api/voters/register
{
  "voter_id": "V001",
  "name": "John Doe",
  "age": 25,
  "gender": "Male",
  "address": "123 Main St",
  "mobile": "+91 98765 43210",  ← Backend ignores this
  "aadhaar": "123456789012"     ← Backend ignores this
}
         ↓
Backend Processing:
1. Validate voter_id, name, age, gender, address
2. Query: SELECT FROM voters WHERE voter_id = ?
3. If not exists → INSERT INTO voters
4. If exists → UPDATE voters
         ↓
Backend Response:
Success (200):
{
  "success": true,
  "voter_id": "V001",
  "message": "Voter John Doe registered. Now capture the face."
}

Error (400/500):
{
  "success": false,
  "message": "Database is not initialized. Run npm run setup-db"
}
         ↓
Frontend Action:
Success → setStep(3) → Show camera interface
Error → Display message to user
```

---

## Quick Troubleshooting Checklist

- [ ] MySQL running (`mysql -u root -p -e "SELECT 1"` succeeds)
- [ ] Database initialized (`npm run setup-db` successful)
- [ ] Backend running on port 5000 (`curl http://localhost:5000/api/health`)
- [ ] All services show "ok" in health check
- [ ] Frontend running on port 5173
- [ ] Browser console has no errors
- [ ] Network tab shows POST to /api/voters/register succeeding
- [ ] Backend terminal shows no "error:" messages
- [ ] Voter_id is valid format (4-20 chars, alphanumeric + hyphens)
- [ ] All required fields filled and valid

---

## Enable Detailed Logging

For production debugging, enable more verbose logging:

1. Edit `server/routes/voterRoutes.js`
2. Add logging after each major step:
```javascript
console.log('DEBUG: Payload received:', body);
console.log('DEBUG: Validation passed, voter_id:', voter_id);
console.log('DEBUG: Database query result:', exist);
```

3. Restart backend (`npm run dev`)

Now check terminal for detailed execution flow.

