const Order = require("../models/orderModel");
const Cart = require("../models/cartModel")
const Restaurant = require("../models/restaurantModel")
const User = require("../models/userModel")
const { calculateOrderCost} = require("../services/orderCostCalculator")
// Create Orderconst Product = require("../models/FoodItem"); // Your product model

const Product = require("../models/productModel")
exports.createOrder = async (req, res) => {
  try {
    const { customerId, restaurantId, orderItems, paymentMethod, location } = req.body;

    if (!restaurantId || !orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      return res.status(400).json({ error: "restaurantId and orderItems are required" });
    }

    // Validate location
    if (!location || !Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
      return res.status(400).json({
        error: "Valid location coordinates are required in [longitude, latitude] format",
      });
    }

    const [longitude, latitude] = location.coordinates;
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      return res.status(400).json({
        error: "Coordinates must be numbers in [longitude, latitude] format",
      });
    }

    // Extract product IDs from order items
    const productIds = orderItems.map(item => item.productId);

    // Fetch active products matching those IDs and restaurant
    const products = await Product.find({ _id: { $in: productIds }, restaurantId, active: true });

    // Extract found product IDs as strings
    const foundIds = products.map(p => p._id.toString());

    // Find missing product IDs by comparing with order items
    const missingIds = productIds.filter(id => !foundIds.includes(id));

    if (missingIds.length > 0) {
      const missingItems = orderItems.filter(item => missingIds.includes(item.productId));
      const missingNames = missingItems.map(item => item.name || "Unknown Product");

      return res.status(400).json({
        error: "Some ordered items are invalid or unavailable",
        missingProducts: missingNames,
      });
    }

    // Calculate total amount dynamically
    let totalAmount = 0;
    const now = new Date();

    for (const item of orderItems) {
      const product = products.find(p => p._id.toString() === item.productId);
      let price = product.price;

      if (
        product.specialOffer &&
        product.specialOffer.discount > 0 &&
        product.specialOffer.startDate <= now &&
        now <= product.specialOffer.endDate
      ) {
        const discountAmount = (price * product.specialOffer.discount) / 100;
        price = price - discountAmount;
      }

      totalAmount += price * (item.quantity || 1);
    }

    const io = req.app.get("io");

    const orderData = {
      restaurantId,
      orderItems,
      totalAmount,
      paymentMethod,
      paymentStatus: "pending",
      customerId: customerId || null,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
    };

    const order = new Order(orderData);
    const savedOrder = await order.save();

    io.to(restaurantId).emit("new-order", {
      orderId: savedOrder._id,
      totalAmount: savedOrder.totalAmount,
      orderItems: savedOrder.orderItems,
    });

    return res.status(201).json(savedOrder);

  } catch (err) {
    console.error("createOrder error:", err);
    return res.status(500).json({ error: "Failed to create order", details: err.message });
  }
};


exports.placeOrder = async (req, res) => {
  try {
    const {
      longitude,
      latitude,
      cartId,
      userId,
      paymentMethod,
      couponCode,
      instructions,
      tipAmount = 0,
      street,
      area,
      landmark,
      city,
      state,
      pincode, // 👈 fixed indentation
      country = "India",
    } = req.body;

    console.log(req.body);

    // ✅ Basic validation
    if (
      !cartId ||
      !userId ||
      !paymentMethod ||
      !longitude ||
      !latitude ||
      !street ||
      !city ||
      !pincode
    ) {
      return res.status(400).json({ message: "Required fields are missing" ,messageType:"failure" });
    }

    // ✅ Find cart and restaurant
    const cart = await Cart.findOne({ _id: cartId, user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found",messageType:"failure"});

    const restaurant = await Restaurant.findById(cart.restaurantId);
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found",messageType:"failure" });

    const userCoords = [parseFloat(longitude), parseFloat(latitude)];

    // ✅ Calculate bill summary
    const billSummary = calculateOrderCost({
      cartProducts: cart.products,
      restaurant,
      userCoords,
      couponCode,
    });

    // ✅ Map order items with product images
    const orderItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId).select("images");
        return {
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          name: item.name,
          totalPrice: item.price * item.quantity,
          image: product?.images?.[0] || null,
        };
      })
    );

    // ✅ Create and save order
    const newOrder = new Order({
      customerId: userId,
      restaurantId: cart.restaurantId,
      orderItems,
      paymentMethod,
      orderStatus: "pending",
      deliveryLocation: { type: "Point", coordinates: userCoords },
      deliveryAddress: {
        street,
        area,
        landmark,
        city,
        state,
        pincode,
        country,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
      subtotal: billSummary.subtotal,
      tax: billSummary.tax,
      discountAmount: billSummary.discount,
      deliveryCharge: billSummary.deliveryFee,
      surgeCharge: 0,
      tipAmount,
      totalAmount: billSummary.total + tipAmount,
      distanceKm: billSummary.distanceKm,
      couponCode,
      instructions,
    });

    const savedOrder = await newOrder.save();

    const io = req.app.get("io");

    // ✅ Restaurant permissions check
    if (restaurant.permissions.canAcceptRejectOrders) {
      console.log("Notify restaurant for order acceptance");
      // You can emit socket or notification here if needed
    } else {
      // ✅ Auto-assign delivery agent
      const assignedAgent = await findAndAssignNearestAgent(savedOrder._id, {
        longitude,
        latitude,
      });

      if (assignedAgent) {
        let updateData = { assignedAgent: assignedAgent._id };

        if (assignedAgent.permissions.canAcceptOrRejectOrders) {
          updateData.orderStatus = "pending_agent_acceptance";
          console.log("Order sent to agent for acceptance:", assignedAgent.fullName);

          await sendPushNotification(
            assignedAgent.userId,
            "New Delivery Request",
            "You have a new delivery request. Please accept it."
          );
        } else {
          updateData.orderStatus = "assigned_to_agent";
          console.log("Order auto-assigned to:", assignedAgent.fullName);

          io.to(`agent_${assignedAgent._id}`).emit("startDeliveryTracking", {
            orderId: savedOrder._id,
            customerId: savedOrder.customerId,
            restaurantId: savedOrder.restaurantId,
          });

          io.to(`user_${savedOrder.customerId}`).emit("agentAssigned", {
            agentId: assignedAgent._id,
            orderId: savedOrder._id,
          });

          io.to(`restaurant_${savedOrder.restaurantId}`).emit("agentAssigned", {
            agentId: assignedAgent._id,
            orderId: savedOrder._id,
          });

          await sendPushNotification(
            savedOrder.customerId,
            "Agent Assigned",
            "Your order is on the way."
          );
          await sendPushNotification(
            savedOrder.restaurantId,
            "Agent Assigned",
            "An agent has been assigned to deliver the order."
          );
        }

        await Order.findByIdAndUpdate(savedOrder._id, updateData);
      } else {
        console.log("No available agent found for auto-assignment.");
        await Order.findByIdAndUpdate(savedOrder._id, {
          orderStatus: "awaiting_agent_assignment",
        });
      }
    }

    return res.status(201).json({
      message: "Order placed successfully",
      orderId: savedOrder._id,
      totalAmount: savedOrder.totalAmount,
      billSummary,
      orderStatus: savedOrder.orderStatus,
    });
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).json({ error: "Failed to place order" });
  }
};
// Get Order by ID
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate("customerId restaurantId orderItems.productId");

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Error fetching order" });
  }
};

// Get Orders by Customer
// Get Orders by Customer with pagination and better response structure
exports.getOrdersByCustomer = async (req, res) => {
  try {
    const customerId = req.user._id;
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Status filter if provided
    const statusFilter = req.query.status 
      ? { orderStatus: req.query.status } 
      : {};

    // Get orders with pagination
    const [orders, total] = await Promise.all([
      Order.find({ customerId, ...statusFilter })
        .populate("restaurantId", "name location address images")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ customerId, ...statusFilter })
    ]);

    // Transform the orders data
    const transformedOrders = orders.map(order => ({
      orderId: order._id,
      customerId: order.customerId,
      restaurant: {
        id: order.restaurantId._id,
        name: order.restaurantId.name,
        image: order.restaurantId.images?.[0],
        location: order.restaurantId.location,
        address: order.restaurantId.address
      },
      items: order.orderItems.map(item => ({
        id: item.productId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        image: item.image
      })),
      delivery: {
        address: order.deliveryAddress,
        location: order.deliveryLocation,
        distanceKm: order.distanceKm,
        status: order.orderStatus,
        statusHistory: order.rejectionHistory.length > 0 
          ? order.rejectionHistory 
          : [{ status: order.orderStatus, timestamp: order.createdAt }]
      },
      payment: {
        method: order.paymentMethod,
        status: order.orderStatus === 'delivered' ? 'paid' : 'pending',
        amount: {
          subtotal: order.subtotal,
          deliveryCharge: order.deliveryCharge,
          tax: order.tax,
          discount: order.discountAmount,
          total: order.totalAmount,
          currency: 'INR'
        }
      },
      timestamps: {
        orderedAt: order.orderTime,
        estimatedDelivery: null, // You might want to calculate this
        preparedAt: order.orderStatus === 'prepared' ? order.updatedAt : null,
        deliveredAt: order.orderStatus === 'delivered' ? order.updatedAt : null
      }
    }));

    res.json({
  success: true,
  messageType: "success",
  message: "Orders fetched successfully",
  count: orders.length,
  data: transformedOrders,
  pagination: {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit)
  }
})

  } catch (err) {
    console.error('Error fetching orders:', err);
  res.status(500).json({ 
  success: false,
  messageType: "failure",
  message: "Failed to fetch orders",
  error: process.env.NODE_ENV === 'development' ? err.message : undefined
});
  }
};

// Get Orders by Agent
exports.getOrdersByAgent = async (req, res) => {
  try {
    const orders = await Order.find({ assignedAgent: req.params.agentId });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// Update Order Status
// exports.updateOrderStatus = async (req, res) => {
//   const { status } = req.body;
//   const validStatuses = [
//     "pending", "preparing", "ready", "on_the_way", "delivered", "cancelled"
//   ];

//   if (!validStatuses.includes(status)) {
//     return res.status(400).json({ error: "Invalid status value" });
//   }

//   try {
//     const updated = await Order.findByIdAndUpdate(
//       req.params.orderId,
//       { orderStatus: status },
//       { new: true }
//     );
//     if (!updated) return res.status(404).json({ error: "Order not found" });
//     res.json(updated);
//   } catch (err) {
//     res.status(500).json({ error: "Failed to update status" });
//   }
// };

// Cancel Order
exports.cancelOrder = async (req, res) => {
  const { reason, debtCancellation } = req.body;
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      {
        orderStatus: "cancelled",
        cancellationReason: reason || "",
        debtCancellation: debtCancellation || false,
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Order not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel order" });
  }
};

// Review Order
exports.reviewOrder = async (req, res) => {
  const { customerReview, restaurantReview } = req.body;
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      {
        customerReview: customerReview || "",
        restaurantReview: restaurantReview || "",
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Order not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit review" });
  }
};

// Update Delivery Mode
exports.updateDeliveryMode = async (req, res) => {
  const { mode } = req.body;
  const validModes = ["contact", "no_contact", "do_not_disturb"];

  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: "Invalid delivery mode" });
  }

  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      { deliveryMode: mode },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update delivery mode" });
  }
};

// Assign Agent
exports.assignAgent = async (req, res) => {
  const { agentId } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: "agentId is required" });
  }

  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      { assignedAgent: agentId },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to assign agent" });
  }
};

// Get All Orders (Admin)
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("customerId restaurantId");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};

// Update Scheduled Time
exports.updateScheduledTime = async (req, res) => {
  const { scheduledTime } = req.body;
  if (!scheduledTime) {
    return res.status(400).json({ error: "scheduledTime is required" });
  }

  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      { scheduledTime },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update scheduled time" });
  }
};

// Update Instructions
exports.updateInstructions = async (req, res) => {
  const { instructions } = req.body;

  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      { instructions },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update instructions" });
  }
};

// Apply Discount
exports.applyDiscount = async (req, res) => {
  const { discountAmount, couponCode } = req.body;

  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.orderId,
      { discountAmount, couponCode },
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to apply discount" });
  }
};

// Get Customer Order Status
exports.getCustomerOrderStatus = async (req, res) => {
  try {
    const customerId = req.params.customerId;

    const orders = await Order.find({ customerId })
      .select("orderStatus _id scheduledTime restaurantId")
      .populate("restaurantId", "name");

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Server error while fetching order status" });
  }
};

// Get Guest Orders (Admin)
exports.getGuestOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customerId: null });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch guest orders' });
  }
};

// Get Scheduled Orders (Admin or Restaurant Dashboard)
exports.getScheduledOrders = async (req, res) => {
  try {
    const now = new Date();
    const orders = await Order.find({
      scheduledTime: { $gte: now },
      orderStatus: "pending",
    }).populate("customerId restaurantId");

    res.json(orders);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch scheduled orders",
      details: err.message,
    });
  }
};

// Get Customer Scheduled Orders
exports.getCustomerScheduledOrders = async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const now = new Date();

    const orders = await Order.find({
      customerId,
      scheduledTime: { $gte: now },
      orderStatus: "pending",
    }).sort({ scheduledTime: 1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch customer scheduled orders",
      details: err.message,
    });
  }
};




exports.merchantAcceptOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate orderId format
    if (!orderId || orderId.length !== 24) {
      return res.status(400).json({ error: "Invalid order ID format" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Prevent double accepting or invalid status transitions
    if (order.orderStatus === "accepted") {
      return res.status(400).json({ error: "Order is already accepted" });
    }

    if (order.orderStatus === "cancelled") {
      return res.status(400).json({ error: "Cannot accept a cancelled order" });
    }

    // Update status to 'accepted'
    order.orderStatus = "accepted";
    await order.save();

    // Emit to restaurant room via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(order.restaurantId.toString()).emit("order-accepted", {
        orderId: order._id,
        message: "Order has been accepted by the merchant"
      });
    }

    res.status(200).json({
      success: true,
      message: "Order accepted successfully",
      order
    });

  } catch (error) {
    console.error("merchantAcceptOrder error:", error);
    res.status(500).json({
      error: "Failed to accept order",
      details: error.message
    });
  }
};



exports.merchantRejectOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { rejectionReason } = req.body;

    // Validate orderId format
    if (!orderId || orderId.length !== 24) {
      return res.status(400).json({ error: "Invalid order ID format" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // Prevent rejecting completed or already cancelled orders
    if (order.orderStatus === "completed") {
      return res.status(400).json({ error: "Cannot reject a completed order" });
    }

    if (order.orderStatus === "cancelled") {
      return res.status(400).json({ error: "Order is already cancelled" });
    }

    // Update order status to 'cancelled'
    order.orderStatus = "cancelled";
    order.rejectionReason = rejectionReason || "Rejected by merchant";
    await order.save();

    // Emit event via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(order.restaurantId.toString()).emit("order-rejected", {
        orderId: order._id,
        message: "Order has been rejected by the merchant",
        reason: order.rejectionReason
      });
    }

    res.status(200).json({
      success: true,
      message: "Order rejected successfully",
      order
    });

  } catch (error) {
    console.error("merchantRejectOrder error:", error);
    res.status(500).json({
      error: "Failed to reject order",
      details: error.message
    });
  }
};
// Update Order Status (Merchant)
exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { newStatus } = req.body;

  const merchantAllowedStatuses = [
    'accepted_by_restaurant',
    'rejected_by_restaurant',
    'preparing',
    'ready'
  ];

  if (!merchantAllowedStatuses.includes(newStatus)) {
    return res.status(400).json({
      error: `Invalid status. Merchants can only update status to: ${merchantAllowedStatuses.join(', ')}`
    });
  }

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    order.orderStatus = newStatus;
    await order.save();


    res.status(200).json({
      message: 'Order status updated successfully',
      order
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};



exports.getOrderPriceSummary = async (req, res) => {
  try {
    const { longitude, latitude, couponCode, cartId, userId } = req.body;


    if (!cartId || !userId) {
      return res.status(400).json({ message: "cartId and userId are required", messageType: "failure" });
    }

    const cart = await Cart.findOne({ _id: cartId, user: userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found for this user", messageType: "failure" });
    }

    if (!cart.products || cart.products.length === 0) {
      return res.status(400).json({ message: "Cart is empty", messageType: "failure" });
    }

    const restaurant = await Restaurant.findById(cart.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found", messageType: "failure" });
    }

    const userCoords = [parseFloat(longitude), parseFloat(latitude)];

    const costSummary = calculateOrderCost({
      cartProducts: cart.products,
      restaurant,
      userCoords,
      couponCode,
    });

    // Convert all values to string
    const stringSummary = Object.fromEntries(
      Object.entries(costSummary).map(([key, value]) => [key, value.toString()])
    );

    return res.status(200).json({
      message: "Bill summary calculated successfully",
      messageType: "success",
      data: stringSummary,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error", messageType: "failure" });
  }
};



exports.getOrderPriceSummaryByaddressId = async (req, res) => {
  try {
    const { addressId} = req.params
    const {  couponCode, cartId, userId } = req.body;

    if (!cartId || !userId || !addressId) {
      return res.status(400).json({ 
        message: "cartId, userId, and addressId are required", 
        messageType: "failure" 
      });
    }

    // Find user and their address
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        message: "User not found", 
        messageType: "failure" 
      });
    }

    // Find the specific address
    const address = user.addresses.id(addressId);
    if (!address || !address.location || !address.location.coordinates) {
      return res.status(404).json({ 
        message: "Address not found or invalid location data", 
        messageType: "failure" 
      });
    }

    const cart = await Cart.findOne({ _id: cartId, user: userId });
    if (!cart) {
      return res.status(404).json({ 
        message: "Cart not found for this user", 
        messageType: "failure" 
      });
    }

    if (!cart.products || cart.products.length === 0) {
      return res.status(400).json({ 
        message: "Cart is empty", 
        messageType: "failure" 
      });
    }

    const restaurant = await Restaurant.findById(cart.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ 
        message: "Restaurant not found", 
        messageType: "failure" 
      });
    }

    // Use coordinates from the address
    const userCoords = address.location.coordinates; // [longitude, latitude]

    const costSummary = calculateOrderCost({
      cartProducts: cart.products,
      restaurant,
      userCoords,
      couponCode,
    });

    // Convert all values to string
    const stringSummary = Object.fromEntries(
      Object.entries(costSummary).map(([key, value]) => [key, value.toString()])
    );

    return res.status(200).json({
      message: "Bill summary calculated successfully",
      messageType: "success",
      data: stringSummary,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      message: "Server error", 
      messageType: "failure" 
    });
  }
};




