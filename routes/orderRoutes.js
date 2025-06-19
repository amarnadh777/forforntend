const express = require('express');
const router = express.Router();

const {
  createOrder,
  getAllOrders,
  getOrderById,
  getOrdersByCustomer,
  getOrdersByAgent,
  updateOrderStatus,
  cancelOrder,
  reviewOrder,
  updateDeliveryMode,
  assignAgent,
  updateScheduledTime,
  updateInstructions,
  applyDiscount,
  getScheduledOrders,
  getCustomerScheduledOrders,
  rescheduleOrder,
  merchantAcceptOrder,
  merchantRejectOrder,
  placeOrder,
  getOrderPriceSummary,
  getOrderPriceSummaryByaddressId
 ,getPastOrders
  
} = require('../controllers/orderController');

const {protect} = require("../middlewares/authMiddleware")
// orders
router.post('/create', createOrder); // Create new order


//place order 
router.post("/place-order", protect, placeOrder)

router.get('/', getAllOrders); // Admin - get all orders
router.get('/:orderId', getOrderById); // Get specific order


router.post("/pricesummary", protect, getOrderPriceSummary)

router.post("/pricesummary/:addessId", protect,getOrderPriceSummaryByaddressId)

router.get("/customer/orders", protect,getPastOrders)

module.exports = router;
