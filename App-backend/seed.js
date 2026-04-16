import "dotenv/config";
import mongoose from "mongoose";
import Datacenter from "./models/Datacenter.js";
import Zone from "./models/Zone.js";
import Node from "./models/Node.js";
import SensorReading from "./models/SensorReading.js";
import Alert from "./models/Alert.js";
import AlertThreshold from "./models/AlertThreshold.js";
import User from "./models/User.js";
import RoleElevationRequest from "./models/RoleElevationRequest.js";
import AuditLog from "./models/AuditLog.js";

const DEMO_USER_EMAILS = ["admin@sentinel.com", "user@sentinel.com"];

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to MongoDB");

  await Promise.all([
    Datacenter.deleteMany({}),
    Zone.deleteMany({}),
    Node.deleteMany({}),
    SensorReading.deleteMany({}),
    Alert.deleteMany({}),
    AlertThreshold.deleteMany({}),
    RoleElevationRequest.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  const removedDemoUsers = await User.deleteMany({
    email: { $in: DEMO_USER_EMAILS },
  });

  const seededAdminEmail = "nadasaidani63@gmail.com";
  const existingSeedAdmin = await User.findOne({ email: seededAdminEmail });
  if (!existingSeedAdmin) {
    await User.create({
      email: seededAdminEmail,
      password: "nada123",
      firstName: "Nada",
      lastName: "Saidani",
      phone: "+21622222222",
      role: "admin",
      emailVerified: true,
    });
  }

  const tunis = await Datacenter.create({
    name: "Data Centre Tunis Charguia",
    location: "Charguia, Tunis",
    status: "normal",
  });

  const vdc = await Datacenter.create({
    name: "Virtual Datacenter",
    location: "Simulation locale",
    status: "normal",
  });

  const buildCharguiaSpecs = () => {
    const specs = [];

    const addSeq = ({ part, room, count, roomPart = null }) => {
      for (let i = 1; i <= count; i++) {
        specs.push({
          part,
          room,
          roomPart,
          zoneLabel: `Zone ${i}`,
          nodeCount: 1,
        });
      }
    };

    const addOne = ({ part, room, zoneLabel, roomPart = null, nodeCount = 1 }) => {
      specs.push({
        part,
        room,
        roomPart,
        zoneLabel,
        nodeCount,
      });
    };

    // =========================
    // PARTIE 1
    // =========================

    // Salle C0 : 3 zones
    addSeq({ part: "Partie 1", room: "Salle C0", count: 3 });

    // Salle B0 : 7 zones divisées en 2 parties
    // Partie 1 : 4 zones
    addSeq({ part: "Partie 1", room: "Salle B0", roomPart: "Partie 1", count: 4 });

    // Partie 2 : 3 zones
    addSeq({ part: "Partie 1", room: "Salle B0", roomPart: "Partie 2", count: 3 });

    // Salle Energies : 1 zone
    addSeq({ part: "Partie 1", room: "Salle Energies", count: 1 });

    // Salle Batteries : 1 zone
    addSeq({ part: "Partie 1", room: "Salle Batteries", count: 1 });

    // Salle D : 3 zones
    addSeq({ part: "Partie 1", room: "Salle D", count: 3 });

    // =========================
    // PARTIE 2
    // =========================

    // Salle A0 : 7 zones = 6 zones + 1 zone NVIDIA
    addSeq({ part: "Partie 2", room: "Salle A0", count: 6 });
    addOne({ part: "Partie 2", room: "Salle A0", zoneLabel: "Zone NVIDIA" });

    // Salle Energie 1 : 1 zone
    addSeq({ part: "Partie 2", room: "Salle Energie 1", count: 1 });

    // Salle d'Interconnection : 1 zone
    addSeq({ part: "Partie 2", room: "Salle d'Interconnection", count: 1 });

    // Salle Batteries 1 : 1 zone
    addSeq({ part: "Partie 2", room: "Salle Batteries 1", count: 1 });

    return specs.map((spec, index) => {
      const idx = String(index + 1).padStart(2, "0");
      return {
        ...spec,
        name: [spec.part, spec.room, spec.roomPart, spec.zoneLabel].filter(Boolean).join(" - "),
        description: [spec.part, spec.room, spec.roomPart, spec.zoneLabel].filter(Boolean).join(" / "),
        displayOrder: index + 1,
        nodePrefix: `TC-${idx}`,
      };
    });
  };

  const tunisSpecs = buildCharguiaSpecs();

  const tunisZones = await Zone.insertMany(
    tunisSpecs.map((z) => ({
      name: z.name,
      description: z.description,
      status: "normal",
      datacenterId: tunis._id,

      // ces champs marchent seulement si tu les ajoutes dans Zone.js
      part: z.part,
      room: z.room,
      roomPart: z.roomPart,
      displayOrder: z.displayOrder,
    }))
  );

  const simZones = await Zone.insertMany([
    {
      name: "SIM - Salle Serveurs",
      description: "Zone virtuelle (racks + HVAC)",
      status: "normal",
      datacenterId: vdc._id,
      part: "Simulation",
      room: "Salle Serveurs",
      displayOrder: 1,
    },
    {
      name: "SIM - Energie & UPS",
      description: "Zone virtuelle (UPS + distribution)",
      status: "normal",
      datacenterId: vdc._id,
      part: "Simulation",
      room: "Energie & UPS",
      displayOrder: 2,
    },
    {
      name: "SIM - Réseau",
      description: "Zone virtuelle (switches + routeurs)",
      status: "normal",
      datacenterId: vdc._id,
      part: "Simulation",
      room: "Réseau",
      displayOrder: 3,
    },
  ]);

  const tunisNodes = tunisZones.flatMap((zone, zoneIdx) =>
    Array.from({ length: tunisSpecs[zoneIdx].nodeCount }, (_, i) => ({
      name: `${tunisSpecs[zoneIdx].nodePrefix}-NODE-${i + 1}`,
      zoneId: zone._id,
      isOnline: true,
      status: "normal",
      macAddress: `TC:${String(zoneIdx + 1).padStart(2, "0")}:${String(i + 1).padStart(2, "0")}:AA:BB:CC`,
      firmwareVersion: "2.0",
      lastPing: new Date(),
    }))
  );

  const simNodes = simZones.flatMap((zone, zoneIdx) =>
    Array.from({ length: 3 }, (_, i) => ({
      name: `SIM-${zoneIdx + 1}-NODE-${i + 1}`,
      zoneId: zone._id,
      isOnline: true,
      status: "normal",
      macAddress: `SIM:${zoneIdx}:${i}:AA:BB:CC`,
      firmwareVersion: "2.0",
      lastPing: new Date(),
    }))
  );

  await Node.insertMany([...tunisNodes, ...simNodes]);

  const allZones = [...tunisZones, ...simZones];
  const thresholdDocs = [];

  for (const zone of allZones) {
    thresholdDocs.push(
      {
        scopeType: "zone",
        scopeId: zone._id,
        metricName: "temperature",
        warningMin: 18,
        warningMax: 27,
        alertMin: 15,
        alertMax: 30,
      },
      {
        scopeType: "zone",
        scopeId: zone._id,
        metricName: "humidity",
        warningMin: 40,
        warningMax: 60,
        alertMin: 30,
        alertMax: 70,
      },
      {
        scopeType: "zone",
        scopeId: zone._id,
        metricName: "gasLevel",
        warningMin: 0,
        warningMax: 90,
        alertMin: 0,
        alertMax: 130,
      },
      {
        scopeType: "zone",
        scopeId: zone._id,
        metricName: "pressure",
        warningMin: 450,
        warningMax: 900,
        alertMin: 350,
        alertMax: 1100,
      },
      {
        scopeType: "zone",
        scopeId: zone._id,
        metricName: "vibration",
        warningMin: 0,
        warningMax: 1.2,
        alertMin: 0,
        alertMax: 1.5,
      }
    );
  }

  await AlertThreshold.insertMany(thresholdDocs);

  console.log("🌱 Seed complete");
  console.log(`ðŸ‘¤ Existing users preserved (${removedDemoUsers.deletedCount} demo users removed).`);
  if (!existingSeedAdmin) {
    console.log("ðŸ” Admin account created: nadasaidani63@gmail.com / nada123");
  } else {
    console.log("ðŸ” Admin account preserved: nadasaidani63@gmail.com");
  }
  process.exit(0);
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
