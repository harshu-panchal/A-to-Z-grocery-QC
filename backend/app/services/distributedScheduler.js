/**
 * Distributed Scheduler Service
 * 
 * Executes scheduled jobs with distributed locking to ensure single execution
 * across multiple scheduler instances.
 * 
 * @module services/distributedScheduler
 */

import { v4 as uuidv4 } from 'uuid';
import { getRedisClient, isRedisEnabled } from '../config/redis.js';
import logger from './logger.js';

// Atomic compare-and-delete so an expired-then-reacquired lock is never removed.
const RELEASE_LOCK_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

// Instance ID for lock identification
const instanceId = `scheduler-${uuidv4().slice(0, 8)}`;

// Registered jobs
const registeredJobs = new Map();

// Active intervals
const activeIntervals = new Map();

/**
 * Acquire distributed lock for job execution
 * @param {string} jobName - Job name
 * @param {number} lockDuration - Lock duration in milliseconds
 * @returns {Promise<{acquired: boolean, lockKey: string, lockValue: string}>}
 */
async function acquireLock(jobName, lockDuration) {
  const client = getRedisClient();
  
  if (!client || !isRedisEnabled()) {
    // No Redis available, allow execution (non-production fallback)
    logger.warn('Distributed lock unavailable, executing without lock', {
      jobName,
      instanceId
    });
    return { acquired: true, lockKey: null, lockValue: null };
  }
  
  const lockKey = `scheduler:lock:${jobName}`;
  const lockValue = `${instanceId}:${Date.now()}`;
  
  try {
    // Use SET with NX (not exists) and PX (expiry in milliseconds)
    const result = await client.set(lockKey, lockValue, 'PX', lockDuration, 'NX');
    
    if (result === 'OK') {
      logger.debug('Lock acquired successfully', {
        jobName,
        instanceId,
        lockKey,
        lockDuration
      });
      return { acquired: true, lockKey, lockValue };
    } else {
      // Lock already held by another instance
      const currentLock = await client.get(lockKey);
      logger.debug('Lock acquisition failed - held by another instance', {
        jobName,
        instanceId,
        lockKey,
        currentLock
      });
      return { acquired: false, lockKey, lockValue: null };
    }
  } catch (error) {
    // Redis down: run anyway (same as the no-Redis path). Skipping would stop
    // safety-net jobs like orderAutoCancelJob exactly when Bull queues are
    // also unavailable; the job handlers are idempotent.
    logger.warn('Lock unavailable (Redis error), executing without lock', {
      jobName,
      instanceId,
      error: error.message
    });
    return { acquired: true, lockKey: null, lockValue: null };
  }
}

/**
 * Release distributed lock
 * @param {string} lockKey - Lock key
 * @param {string} lockValue - Lock value (for verification)
 * @returns {Promise<boolean>}
 */
async function releaseLock(lockKey, lockValue) {
  if (!lockKey || !lockValue) {
    return true; // No lock to release
  }
  
  const client = getRedisClient();
  if (!client) {
    return true;
  }
  
  try {
    // Only delete if the lock value matches (we own the lock)
    const released = await client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
    if (released === 1) {
      logger.debug('Lock released successfully', {
        lockKey,
        instanceId
      });
      return true;
    } else {
      logger.warn('Lock release skipped - value mismatch', {
        lockKey,
        instanceId,
        expected: lockValue
      });
      return false;
    }
  } catch (error) {
    logger.error('Error releasing lock', {
      lockKey,
      instanceId,
      error: error.message
    });
    return false;
  }
}

/**
 * Execute job with distributed locking
 * @param {string} name - Job name
 * @param {Function} handler - Job handler function
 * @param {number} lockDuration - Lock duration in milliseconds
 */
async function executeJob(name, handler, lockDuration) {
  const startTime = Date.now();
  let lock = null;
  
  try {
    // Acquire lock
    lock = await acquireLock(name, lockDuration);
    
    if (!lock.acquired) {
      logger.debug('Skipping job execution - lock held by another instance', {
        jobName: name,
        instanceId
      });
      return;
    }
    
    // Execute job
    logger.debug('Starting job execution', {
      jobName: name,
      instanceId
    });
    
    await handler();
    
    const duration = Date.now() - startTime;
    logger.debug('Job execution completed successfully', {
      jobName: name,
      instanceId,
      duration
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Job execution failed', {
      jobName: name,
      instanceId,
      duration,
      error: error.message,
      stack: error.stack
    });
  } finally {
    // Release even when the handler throws, otherwise a failed run keeps the
    // lock for 2x the interval and the next run is skipped.
    if (lock?.acquired && lock.lockKey) {
      await releaseLock(lock.lockKey, lock.lockValue);
    }
  }
}

/**
 * Register a scheduled job
 * @param {string} name - Job name
 * @param {number} intervalMs - Interval in milliseconds
 * @param {Function} handler - Job handler function
 */
function registerScheduledJob(name, intervalMs, handler) {
  if (registeredJobs.has(name)) {
    logger.warn('Job already registered, skipping', { jobName: name });
    return;
  }
  
  const lockDuration = intervalMs * 2; // Lock duration is 2x interval
  
  registeredJobs.set(name, {
    name,
    intervalMs,
    handler,
    lockDuration
  });
  
  logger.debug('Scheduled job registered', {
    jobName: name,
    intervalMs,
    lockDuration,
    instanceId
  });
}

/**
 * Start all registered scheduled jobs
 * @returns {Promise<void>}
 */
async function startScheduledJobs() {
  if (registeredJobs.size === 0) {
    logger.info('No scheduled jobs to start');
    return;
  }
  
  logger.debug(`Starting ${registeredJobs.size} scheduled job(s)`, {
    instanceId,
    jobs: Array.from(registeredJobs.keys())
  });
  
  for (const [name, job] of registeredJobs.entries()) {
    // Execute immediately on start
    executeJob(name, job.handler, job.lockDuration);
    
    // Set up interval
    const intervalHandle = setInterval(() => {
      executeJob(name, job.handler, job.lockDuration);
    }, job.intervalMs);
    
    activeIntervals.set(name, intervalHandle);
    
    logger.debug('Scheduled job started', {
      jobName: name,
      intervalMs: job.intervalMs,
      instanceId
    });
  }
}

/**
 * Stop all scheduled jobs
 * @returns {Promise<void>}
 */
async function stopScheduledJobs() {
  if (activeIntervals.size === 0) {
    logger.info('No scheduled jobs to stop');
    return;
  }
  
  logger.info(`Stopping ${activeIntervals.size} scheduled job(s)`, {
    instanceId
  });
  
  for (const [name, intervalHandle] of activeIntervals.entries()) {
    clearInterval(intervalHandle);
    logger.info('Scheduled job stopped', {
      jobName: name,
      instanceId
    });
  }
  
  activeIntervals.clear();
}

const distributedScheduler = {
  registerScheduledJob,
  startScheduledJobs,
  stopScheduledJobs,
  acquireLock,
  releaseLock,
  instanceId
};

export {
  registerScheduledJob,
  startScheduledJobs,
  stopScheduledJobs,
  acquireLock,
  releaseLock,
  instanceId
};

export default distributedScheduler;
