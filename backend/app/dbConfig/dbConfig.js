import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;
        
        if (!mongoUri) {
            throw new Error('MONGO_URI environment variable is not defined');
        }

        // Perf audit BE-D6: maxPoolSize was hard-set to 10 (the Node driver's
        // own default is 100) for a single process that serves customer,
        // seller, delivery, and admin traffic simultaneously — several
        // endpoints elsewhere in this codebase fan out to many concurrent
        // queries per request, so a pool this small could queue unrelated
        // requests behind a handful of concurrent dashboard loads. Raised to
        // a moderate 25/8, deliberately conservative rather than jumping to
        // the driver default: this deployment is confirmed to run on a
        // MongoDB Atlas M0 (free/shared) cluster, which caps the *cluster's
        // total* connection count at 500 across every app instance/process
        // that connects to it (this API runs multiple HTTP instances plus
        // separate worker/scheduler processes, each with their own pool) —
        // and M0's shared vCPU/throughput ceiling means a larger pool alone
        // cannot fix DB latency the way it would on a dedicated tier; it can
        // only reduce needless queuing for bursts within that ceiling.
        // Override via env if the cluster tier changes.
        const options = {
            maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '25', 10),
            minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '8', 10),
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            retryWrites: true,
            w: 'majority',
        };

        await mongoose.connect(mongoUri, options);
        
        // Connection event listeners
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠ MongoDB disconnected');
        });

        mongoose.connection.on('error', (err) => {
            console.error('✗ MongoDB connection error:', err.message);
        });

    } catch (error) {
        console.error('✗ MongoDB connection failed:', error.message);
        process.exit(1);
    }
};

export default connectDB;