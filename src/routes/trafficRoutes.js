const express = require('express');
const router = express.Router();
const BackendServer = require('../models/BackendServer');
const TrafficConfig = require('../models/TrafficConfig');

// Helper to get or create single traffic config
async function getOrCreateConfig() {
  let config = await TrafficConfig.findOne();
  if (!config) {
    config = await TrafficConfig.create({ policy: 'failover', cpuThreshold: 70, requestsPerPing: 2 });
  }
  return config;
}

// 1. Health Ping Scanner Endpoint
router.post('/ping', async (req, res) => {
  try {
    const servers = await BackendServer.find({ isActive: true });
    const config = await getOrCreateConfig();

    for (const server of servers) {
      const cleanUrl = server.url.trim().endsWith('/') ? server.url.trim().slice(0, -1) : server.url.trim();
      const startTime = Date.now();
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout
        
        // ping public config or root
        const response = await fetch(`${cleanUrl}/api/traffic/public-config`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok || response.status < 500) {
          server.status = 'online';
          server.responseTime = Math.round(Date.now() - startTime);
          server.lastPing = new Date();
          // Simulate dynamic load metrics for health report visualization
          server.cpuUsage = Math.min(95, Math.max(5, Math.floor(Math.random() * 40) + 10));
          server.memoryUsage = Math.min(95, Math.max(10, Math.floor(Math.random() * 30) + 20));
          await server.save();
        } else {
          server.status = 'offline';
          await server.save();
        }
      } catch (err) {
        server.status = 'offline';
        await server.save();
      }
    }
    
    const updatedServers = await BackendServer.find();
    res.json({ message: 'Node health scan complete', servers: updatedServers, config });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 2. Public Config Endpoint (used by client interceptor)
router.get('/public-config', async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    const activeServers = await BackendServer.find({ isActive: true, status: 'online' });
    res.json({
      policy: config.policy,
      cpuThreshold: config.cpuThreshold,
      servers: activeServers
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 3. Server CRUD Endpoints
router.get('/servers', async (req, res) => {
  try {
    const servers = await BackendServer.find().sort({ createdAt: -1 });
    res.json(servers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/servers', async (req, res) => {
  try {
    const { name, url, isPrimary, isActive, weight } = req.body;
    
    // If setting as primary, unset other primaries
    if (isPrimary) {
      await BackendServer.updateMany({}, { isPrimary: false });
    }
    
    const server = new BackendServer({
      name,
      url,
      isPrimary: !!isPrimary,
      isActive: isActive !== undefined ? isActive : true,
      weight: weight || 100,
      status: 'online'
    });
    
    await server.save();
    res.status(201).json(server);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/servers/:id', async (req, res) => {
  try {
    const { name, url, isPrimary, isActive, weight, status } = req.body;
    
    if (isPrimary) {
      await BackendServer.updateMany({ _id: { $ne: req.params.id } }, { isPrimary: false });
    }
    
    const server = await BackendServer.findByIdAndUpdate(
      req.params.id,
      { name, url, isPrimary, isActive, weight, status, lastPing: new Date() },
      { new: true }
    );
    
    res.json(server);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/servers/:id', async (req, res) => {
  try {
    await BackendServer.findByIdAndDelete(req.params.id);
    res.json({ message: 'Server node removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 4. Traffic Config Endpoints
router.get('/config', async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const { policy, cpuThreshold, requestsPerPing, selectedManualServer, maxCapacity, lobbyMode } = req.body;
    let config = await getOrCreateConfig();
    
    config.policy = policy || config.policy;
    config.cpuThreshold = cpuThreshold !== undefined ? cpuThreshold : config.cpuThreshold;
    config.requestsPerPing = requestsPerPing !== undefined ? requestsPerPing : config.requestsPerPing;
    config.maxCapacity = maxCapacity !== undefined ? Number(maxCapacity) : config.maxCapacity;
    config.lobbyMode = lobbyMode || config.lobbyMode;
    if (selectedManualServer !== undefined) config.selectedManualServer = selectedManualServer;
    
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// 5. Telemetry & Dynamic Capacity History Graph Data
router.get('/telemetry-history', async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    const Result = require('../models/Result');
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const dbCandidatesCount = await Result.countDocuments({ updatedAt: { $gte: fifteenMinsAgo } });
    const activeCandidatesCount = dbCandidatesCount > 0 ? dbCandidatesCount : (config.currentTrafficLoad || 12);
    
    const maxCapacity = config.maxCapacity || 50;
    const isCapacityExceeded = activeCandidatesCount >= maxCapacity;
    const isLobbyActive = config.lobbyMode === 'force_enabled' || (config.lobbyMode === 'auto' && isCapacityExceeded);
    
    const queueDelay = isLobbyActive ? Math.min(30, Math.max(5, Math.ceil((activeCandidatesCount - maxCapacity + 1) * 2))) : 0;

    const graphData = [];
    const now = Date.now();
    for (let i = 9; i >= 0; i--) {
      const timeLabel = new Date(now - i * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const variance = (i === 0) ? 0 : Math.floor(Math.random() * 8) - 4;
      const trafficVal = Math.max(2, activeCandidatesCount + variance);
      const isExceededPoint = trafficVal >= maxCapacity;
      const delayPoint = (config.lobbyMode === 'force_enabled' || (config.lobbyMode === 'auto' && isExceededPoint))
        ? Math.min(30, Math.max(5, Math.ceil((trafficVal - maxCapacity + 1) * 2)))
        : 0;

      graphData.push({
        time: timeLabel,
        activeCandidates: trafficVal,
        capacityThreshold: maxCapacity,
        queueDelaySeconds: delayPoint,
        isCapacityFulled: isExceededPoint
      });
    }

    res.json({
      config,
      currentActiveCandidates: activeCandidatesCount,
      maxCapacity,
      isCapacityExceeded,
      isLobbyActive,
      currentQueueDelay: queueDelay,
      graphData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
