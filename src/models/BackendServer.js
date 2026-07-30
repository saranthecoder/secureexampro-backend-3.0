const mongoose = require('mongoose');

const backendServerSchema = new mongoose.Schema({
  name: { type: String, required: true },          // Server Name (e.g. "Primary Render Node")
  url: { type: String, required: true },           // Base URL (e.g. "https://ssms3-0-be.onrender.com")
  isPrimary: { type: Boolean, default: false },    // Primary Node flag
  isActive: { type: Boolean, default: true },      // Turned ON/OFF flag (Standby control)
  status: { type: String, enum: ['online', 'offline', 'standby'], default: 'online' },
  responseTime: { type: Number, default: 0 },      // Response latency in ms
  cpuUsage: { type: Number, default: 15 },         // CPU Load %
  memoryUsage: { type: Number, default: 30 },      // RAM Load %
  weight: { type: Number, default: 100 },          // Traffic weight %
  lastPing: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('BackendServer', backendServerSchema);
