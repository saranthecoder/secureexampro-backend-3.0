const mongoose = require('mongoose');

const trafficConfigSchema = new mongoose.Schema({
  policy: { 
    type: String, 
    enum: ['failover', 'cpu-adaptive', 'round-robin', 'latency', 'manual'], 
    default: 'failover' 
  },
  cpuThreshold: { type: Number, default: 70 },        // Auto-scale CPU trigger %
  requestsPerPing: { type: Number, default: 2 },       // Health check ping count
  maxCapacity: { type: Number, default: 50 },          // Concurrent candidates capacity threshold
  lobbyMode: { 
    type: String, 
    enum: ['auto', 'force_enabled', 'force_disabled'], 
    default: 'auto' 
  },
  currentTrafficLoad: { type: Number, default: 0 },
  selectedManualServer: { type: mongoose.Schema.Types.ObjectId, ref: 'BackendServer' }
}, { timestamps: true });

module.exports = mongoose.model('TrafficConfig', trafficConfigSchema);
