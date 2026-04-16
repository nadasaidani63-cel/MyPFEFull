# Sentinel IoT Backend

Node.js / Express / MongoDB backend for the Sentinel IoT data center monitoring platform.

## Folder Structure

```
sentinel-backend/
├── config/
│   └── db.js               # MongoDB connection
├── controllers/
│   ├── authController.js
│   ├── datacenterController.js
│   ├── zoneController.js
│   ├── nodeController.js
│   ├── sensorController.js
│   ├── alertController.js
│   ├── thresholdController.js
│   └── userController.js
├── middleware/
│   └── authMiddleware.js   # JWT protect + role authorize
├── models/
│   ├── User.js
│   ├── Datacenter.js
│   ├── Zone.js
│   ├── Node.js
│   ├── SensorReading.js
│   ├── Alert.js
│   └── AlertThreshold.js
├── routes/
│   ├── authRoutes.js
│   ├── datacenterRoutes.js
│   ├── zoneRoutes.js
│   ├── nodeRoutes.js
│   ├── sensorRoutes.js
│   ├── alertRoutes.js
│   ├── thresholdRoutes.js
│   └── userRoutes.js
├── .env.example
├── package.json
└── server.js
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret

# 3. Run in development
npm run dev

# 4. Run in production
npm start
```

## API Endpoints

### Auth
| Method | Route | Access |
|--------|-------|--------|
| POST | /api/auth/register | Public |
| POST | /api/auth/login | Public |
| GET | /api/auth/me | Protected |

### Datacenters
| Method | Route | Access |
|--------|-------|--------|
| GET | /api/datacenters | All users |
| GET | /api/datacenters/:id | All users |
| POST | /api/datacenters | Administrator |
| PUT | /api/datacenters/:id | Administrator |
| DELETE | /api/datacenters/:id | Administrator |

### Zones
| Method | Route | Access |
|--------|-------|--------|
| GET | /api/zones?datacenterId= | All users |
| POST | /api/zones | Admin, Superviseur |
| PUT | /api/zones/:id | Admin, Superviseur |
| DELETE | /api/zones/:id | Administrator |

### Nodes
| Method | Route | Access |
|--------|-------|--------|
| GET | /api/nodes?datacenterId= | All users |
| POST | /api/nodes | Admin, Superviseur, Technicien |
| PUT | /api/nodes/:id | Admin, Superviseur, Technicien |
| DELETE | /api/nodes/:id | Administrator |

### Sensors
| Method | Route | Access |
|--------|-------|--------|
| GET | /api/sensors/latest?datacenterId= | All users |
| GET | /api/sensors/history?datacenterId= | All users |
| POST | /api/sensors | Open (ESP32 nodes) |

### Alerts
| Method | Route | Access |
|--------|-------|--------|
| GET | /api/alerts?datacenterId= | All users |
| PATCH | /api/alerts/:id/acknowledge | All users |
| PATCH | /api/alerts/:id/resolve | Admin, Superviseur, Technicien |

### Thresholds
| Method | Route | Access |
|--------|-------|--------|
| GET | /api/thresholds?zoneId= | All users |
| POST | /api/thresholds | Admin, Superviseur |
| PUT | /api/thresholds/:id | Admin, Superviseur |
| DELETE | /api/thresholds/:id | Administrator |

### Users (Admin)
| Method | Route | Access |
|--------|-------|--------|
| GET | /api/users | Administrator |
| PUT | /api/users/:id/role | Administrator |
| DELETE | /api/users/:id | Administrator |

## Roles
- `administrator` — full access
- `superviseur` — manage zones, thresholds, resolve alerts
- `technicien` — manage nodes, acknowledge alerts
- `utilisateur` — read only
