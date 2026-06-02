# Auth Microservice API Endpoints

This document describes all available endpoints in the authentication microservice, how/when they should be used, and where they should be consumed (frontend vs backend).

> **Base URL (development):** `http://localhost:3001`
> **Base URL (production):** `https://auth.stirdotcom.net`
> **Base URL (staging):** `https://staging-auth.stirdotcom.net`
>
> **Note:** The port is configurable via the `PORT` environment variable (default `3001`). Subject to change.

---

## Table of Contents

1. [Health Check](#1-health-check)
2. [Get Firebase Client Config](#2-get-firebase-client-config)
3. [Verify Authentication Token](#3-verify-authentication-token)
4. [Error Responses](#4-error-responses)
5. [Authentication Flow](#5-authentication-flow)

---

## 1. Health Check

Used to verify the service is running and responsive.

### `GET /health`

**Where to use:** Backend monitoring, load balancers, deployment health checks.

**When to use:** After deployment to verify the service started successfully. Can be called periodically by monitoring systems.

#### Request

No headers, no body required.

#### Response `200 OK`

```json
{
  "status": "OK",
  "timestamp": "2026-06-02T23:00:00.000Z"
}
```

#### Example

```bash
curl http://localhost:3001/health
```

---

## 2. Get Firebase Client Config

Returns the Firebase client SDK configuration needed to initialize Firebase Auth on the frontend.

### `GET /api/firebase-config`

**Where to use:** **Frontend only.** This endpoint provides the Firebase config object that the client-side Firebase SDK needs to initialize.

**When to use:** Once, when the frontend application loads (e.g., in a React `useEffect` or a layout component). The config should be cached in memory after the first fetch — do not call this on every page navigation.

#### Request

No authentication required. No request body.

#### Response `200 OK`

```json
{
  "apiKey": "AIzaSy...",
  "authDomain": "your-project.firebaseapp.com",
  "projectId": "your-project-id",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abc123"
}
```

#### Response `500 Internal Server Error`

```json
{
  "error": "Failed to get Firebase configuration",
  "timestamp": "2026-06-02T23:00:00.000Z"
}
```

#### Example

```bash
curl http://localhost:3001/api/firebase-config
```

#### Frontend Usage Pattern

```typescript
// Fetch the config once at app startup
let firebaseConfig: FirebaseConfig | null = null;

async function getFirebaseConfig(): Promise<FirebaseConfig> {
  if (firebaseConfig) return firebaseConfig;
  const res = await fetch('http://localhost:3001/api/firebase-config');
  if (!res.ok) throw new Error('Failed to fetch Firebase config');
  firebaseConfig = await res.json();
  return firebaseConfig;
}

// Then use it to initialize Firebase
const config = await getFirebaseConfig();
const app = initializeApp(config);
const auth = getAuth(app);
```

---

## 3. Verify Authentication Token

Verifies a Firebase ID token and returns the authenticated user's information.

### `GET /api/verify`

**Where to use:** **Backend services** that need to validate that a request comes from an authenticated user. For example, a game server or API gateway that receives requests from the frontend with a Firebase token in the `Authorization` header.

**When to use:** On every protected API call from the frontend to a backend service. The frontend sends its Firebase ID token, and the backend calls this endpoint to verify it before processing the request.

#### Request Headers

| Header          | Required | Value                        |
|-----------------|----------|------------------------------|
| `Authorization` | Yes      | `Bearer <FIREBASE_ID_TOKEN>` |

#### Response `200 OK`

```json
{
  "authenticated": true,
  "user": {
    "uid": "abc123def456",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

#### Response `401 Unauthorized`

Returned when no token is provided.

```json
{
  "error": "Access token required"
}
```

#### Response `403 Forbidden`

Returned when the token is invalid or expired.

```json
{
  "error": "Invalid or expired token"
}
```

#### Response `503 Service Unavailable`

Returned when Firebase Admin SDK is not initialized (e.g., startup failure).

```json
{
  "error": "Authentication service unavailable"
}
```

#### Example

```bash
# Get a Firebase ID token from the frontend, then:
curl http://localhost:3001/api/verify \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."
```

#### Backend Usage Pattern

```typescript
// From another backend service (e.g., game server):
async function verifyToken(token: string): Promise<{ uid: string; email?: string }> {
  const res = await fetch('http://localhost:3001/api/verify', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error('Authentication failed');
  }

  const data = await res.json();
  return data.user;
}
```

---

## 4. Error Responses

All endpoints return errors in a consistent format:

### Error Response Shape

```json
{
  "error": "Human-readable error message",
  "timestamp": "2026-06-02T23:00:00.000Z",
  "path": "/api/verify"
}
```

The `path` field is only included for errors that pass through the error handler middleware (uncaught exceptions). Direct error responses (like 401 from `/api/verify`) may omit the `path` field.

### Common HTTP Status Codes

| Status | Meaning                       |
|--------|-------------------------------|
| 200    | Success                       |
| 400    | Validation error              |
| 401    | Missing or invalid token      |
| 403    | Token expired or invalid      |
| 409    | Resource already exists       |
| 500    | Internal server error         |
| 503    | Service unavailable           |

---

## 5. Authentication Flow

This diagram shows how the frontend and backend services interact with the auth microservice:

```
┌──────────────┐          ┌──────────────────┐          ┌─────────────────┐
│              │  1. GET   │                  │  2. GET   │                 │
│   Frontend   │──────────▶│  Auth Microservice│──────────▶│  Firebase Auth  │
│  (Next.js)   │ /api/     │  (this service)  │           │  (Google)       │
│              │ firebase- │                  │           │                 │
│              │ config    │                  │           │                 │
│              │◀──────────│                  │◀──────────│                 │
│              │  config   │                  │  verify   │                 │
│              │           │                  │           │                 │
│              │  3. Sign in with Firebase    │           │                 │
│              │─────────────────────────────────────────▶│                 │
│              │◀─────────────────────────────────────────│                 │
│              │  ID Token  │                             │                 │
│              │           │                  │           │                 │
│  4. Call     │           │                  │           │                 │
│  backend     │           │                  │           │                 │
│  with token  │           │                  │           │                 │
│     │        │           │                  │           │                 │
│     ▼        │           │                  │           │                 │
│  ┌───────────┴──┐       │  5. GET /api/    │           │                 │
│  │      Server  │──────▶│  verify          │           │                 │
│  │ or API       │       │  (validates      │           │                 │
│  │ Gateway      │◀──────│  token)          │           │                 │
│  └──────────────┘       │                  │           │                 │
│                         └──────────────────┘           └─────────────────┘
```

### Step-by-step

1. **Frontend loads** → calls `GET /api/firebase-config` to get the Firebase SDK config
2. **Frontend initializes** Firebase Auth SDK with the config
3. **User signs in** via Firebase Auth (email/password or Google) → receives a Firebase ID token
4. **Frontend calls backend services** (e.g., game server) with the ID token in the `Authorization: Bearer <token>` header
5. **Backend service** calls `GET /api/verify` on this auth microservice to validate the token and get user info before processing the request
