import express from 'express';
import { getFAQs, getPublishedFAQs, createFAQ, updateFAQ, deleteFAQ } from '../controller/faqController.js';
import { verifyToken, allowRoles } from '../middleware/authMiddleware.js';

// Public (customer/seller/delivery help pages): read-only, published only.
export const publicFaqRouter = express.Router();
publicFaqRouter.get('/', getPublishedFAQs);

// Admin management: every route requires an admin token.
const router = express.Router();
router.use(verifyToken, allowRoles('admin'));

router.get('/', getFAQs);
router.post('/', createFAQ);
router.get('/:id', getFAQs); // Generic get by id if needed
router.put('/:id', updateFAQ);
router.delete('/:id', deleteFAQ);

export default router;
