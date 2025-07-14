const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Restaurant = require("../models/restaurantModel");
const User = require("../models/userModel");
const { calculateOrderCost, calculateOrderCostV2 } = require("../services/orderCostCalculator");
const turf = require("@turf/turf");
// Create Orderconst Product = require("../models/FoodItem"); // Your product model
const mongoose = require("mongoose");
const Product = require("../models/productModel");
const restaurantService = require("../services/restaurantService");
const productService = require("../services/productService");
const isLocationInServiceArea = require("../services/isLocationInServiceArea");
const { getApplicableSurgeFee } = require("../services/surgeCalculator");
const feeService = require("../services/feeService")
const Permission = require("../models/restaurantPermissionModel")
const Offer = require("../models/offerModel")
const {assignTask} = require("../services/allocationService")
const crypto = require("crypto");
const razorpay = require("../config/razorpayInstance");
exports.createOrder = async (req, res) => {
  try {
    const { customerId, restaurantId, orderItems, paymentMethod, location } =
      req.body;

    if (
      !restaurantId ||
      !orderItems ||
      !Array.isArray(orderItems) ||
      orderItems.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "restaurantId and orderItems are required" });
    }

    // Validate location
    if (
      !location ||
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2
    ) {
      return res.status(400).json({
        error:
          "Valid location coordinates are required in [longitude, latitude] format",
      });
    }

    const [longitude, latitude] = location.coordinates;
    if (typeof longitude !== "number" || typeof latitude !== "number") {
      return res.status(400).json({
        error: "Coordinates must be numbers in [longitude, latitude] format",
      });
    }

    // Extract product IDs from order items
    const productIds = orderItems.map((item) => item.productId);

    // Fetch active products matching those IDs and restaurant
    const products = await Product.find({
      _id: { $in: productIds },
      restaurantId,
      active: true,
    });

    // Extract found product IDs as strings
    const foundIds = products.map((p) => p._id.toString());

    // Find missing product IDs by comparing with order items
    const missingIds = productIds.filter((id) => !foundIds.includes(id));

    if (missingIds.length > 0) {
      const missingItems = orderItems.filter((item) =>
        missingIds.includes(item.productId)
      );
      const missingNames = missingItems.map(
        (item) => item.name || "Unknown Product"
      );

      return res.status(400).json({
        error: "Some ordered items are invalid or unavailable",
        missingProducts: missingNames,
      });
    }

    // Calculate total amount dynamically
    let totalAmount = 0;
    const now = new Date();

    for (const item of orderItems) {
      const product = products.find((p) => p._id.toString() === item.productId);
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
    return res
      .status(500)
      .json({ error: "Failed to create order", details: err.message });
  }
};

exports.placeOrder = async (req, res) => {
  // try {
  //   const {
  //     longitude,
  //     latitude,
  //     cartId,
  //     userId,
  //     paymentMethod,
  //     couponCode,
  //     instructions,
  //     tipAmount = 0,
  //     // Address fields
  //     type = "Home", // Default to Home if not specified
  //     receiverName,
  //     receiverPhone,
  //     area,
  //     directionsToReach,
  //     displayName,
  //     street,
  //     landmark,
  //     city,
  //     state,
  //     pincode,
  //     country = "India",
  //   } = req.body;

  //   // Basic validation
  //   const requiredFields = {
  //     cartId,
  //     userId,
  //     paymentMethod,
  //     longitude,
  //     latitude,
  //     street,
  //     city,
  //     pincode,
  //   };

  //   const missingFields = Object.entries(requiredFields)
  //     .filter(([_, value]) => !value)
  //     .map(([key]) => key);

  //   if (missingFields.length > 0) {
  //     return res.status(400).json({
  //       message: `Missing required fields: ${missingFields.join(", ")}`,
  //       messageType: "failure",
  //     });
  //   }

  //   // Validate coordinates
  //   if (isNaN(parseFloat(longitude)) || isNaN(parseFloat(latitude))) {
  //     return res.status(400).json({
  //       message: "Invalid coordinates provided",
  //       messageType: "failure",
  //     });
  //   }

  //   const userCoords = [parseFloat(longitude), parseFloat(latitude)];

  //   // Validate coordinate ranges
  //   if (
  //     userCoords[0] < -180 ||
  //     userCoords[0] > 180 ||
  //     userCoords[1] < -90 ||
  //     userCoords[1] > 90
  //   ) {
  //     return res.status(400).json({
  //       message:
  //         "Coordinates out of valid range (longitude: -180 to 180, latitude: -90 to 90)",
  //       messageType: "failure",
  //     });
  //   }

  //   // Find cart and restaurant
  //   const cart = await Cart.findOne({ _id: cartId, user: userId });
  //   if (!cart) {
  //     return res.status(404).json({
  //       message: "Cart not found",
  //       messageType: "failure",
  //     });
  //   }

  //   const restaurant = await Restaurant.findById(cart.restaurantId);
  //   if (!restaurant) {
  //     return res.status(404).json({
  //       message: "Restaurant not found",
  //       messageType: "failure",
  //     });
  //   }

  //   // Calculate bill summary
  //   const billSummary = calculateOrderCost({
  //     cartProducts: cart.products,
  //     restaurant,
  //     userCoords,
  //     couponCode,
  //   });

  //   // Map order items with product images
  //   const orderItems = await Promise.all(
  //     cart.products.map(async (item) => {
  //       const product = await Product.findById(item.productId).select("images");
  //       return {
  //         productId: item.productId,
  //         quantity: item.quantity,
  //         price: item.price,
  //         name: item.name,
  //         totalPrice: item.price * item.quantity,
  //         image: product?.images?.[0] || null,
  //       };
  //     })
  //   );

  //   // Create and save order with enhanced delivery address
  //   const newOrder = new Order({
  //     customerId: userId,
  //     restaurantId: cart.restaurantId,
  //     orderItems,
  //     paymentMethod,
  //     orderStatus: "pending",
  //     deliveryLocation: { type: "Point", coordinates: userCoords },
  //     deliveryAddress: {
  //       type,
  //       displayName: displayName || `${type} address`,
  //       receiverName,
  //       receiverPhone,
  //       street,
  //       area,
  //       landmark,
  //       directionsToReach,
  //       city,
  //       state,
  //       pincode,
  //       country,
  //       latitude: parseFloat(latitude),
  //       longitude: parseFloat(longitude),
  //     },
  //     subtotal: billSummary.subtotal,
  //     tax: billSummary.tax,
  //     discountAmount: billSummary.discount,
  //     deliveryCharge: billSummary.deliveryFee,
  //     surgeCharge: 0,
  //     tipAmount,
  //     totalAmount: billSummary.total + tipAmount,
  //     distanceKm: billSummary.distanceKm,
  //     couponCode,
  //     instructions,
  //   });

  //   const savedOrder = await newOrder.save();

  //   // Clear the cart after successful order placement
  //   await Cart.findByIdAndDelete(cartId);

  //   // Format order data to string values
  //   const formattedOrder = {
  //     _id: savedOrder._id?.toString() || "",
  //     customerId: savedOrder.customerId?.toString() || "",
  //     restaurantId: savedOrder.restaurantId?.toString() || "",
  //     orderItems: savedOrder.orderItems.map((item) => ({
  //       productId: item.productId?.toString() || "",
  //       quantity: item.quantity?.toString() || "0",
  //       price: item.price?.toString() || "0",
  //       name: item.name?.toString() || "",
  //       totalPrice: item.totalPrice?.toString() || "0",
  //       image: item.image ? item.image.toString() : "",
  //     })),
  //     paymentMethod: savedOrder.paymentMethod?.toString() || "",
  //     orderStatus: savedOrder.orderStatus?.toString() || "",
  //     deliveryLocation: {
  //       type: savedOrder.deliveryLocation?.type?.toString() || "",
  //       coordinates:
  //         savedOrder.deliveryLocation?.coordinates?.map(
  //           (coord) => coord?.toString() || "0"
  //         ) || [],
  //     },
  //     deliveryAddress: {
  //       type: savedOrder.deliveryAddress?.type?.toString() || "Home",
  //       displayName: savedOrder.deliveryAddress?.displayName?.toString() || "",
  //       receiverName:
  //         savedOrder.deliveryAddress?.receiverName?.toString() || "",
  //       receiverPhone:
  //         savedOrder.deliveryAddress?.receiverPhone?.toString() || "",
  //       street: savedOrder.deliveryAddress?.street?.toString() || "",
  //       area: savedOrder.deliveryAddress?.area?.toString() || "",
  //       landmark: savedOrder.deliveryAddress?.landmark?.toString() || "",
  //       directionsToReach:
  //         savedOrder.deliveryAddress?.directionsToReach?.toString() || "",
  //       city: savedOrder.deliveryAddress?.city?.toString() || "",
  //       state: savedOrder.deliveryAddress?.state?.toString() || "",
  //       pincode: savedOrder.deliveryAddress?.pincode?.toString() || "",
  //       country: savedOrder.deliveryAddress?.country?.toString() || "India",
  //       latitude: savedOrder.deliveryAddress?.latitude?.toString() || "",
  //       longitude: savedOrder.deliveryAddress?.longitude?.toString() || "",
  //     },
  //     subtotal: savedOrder.subtotal?.toString() || "0",
  //     tax: savedOrder.tax?.toString() || "0",
  //     discountAmount: savedOrder.discountAmount?.toString() || "0",
  //     deliveryCharge: savedOrder.deliveryCharge?.toString() || "0",
  //     surgeCharge: savedOrder.surgeCharge?.toString() || "0",
  //     tipAmount: savedOrder.tipAmount?.toString() || "0",
  //     totalAmount: savedOrder.totalAmount?.toString() || "0",
  //     distanceKm: savedOrder.distanceKm?.toString() || "0",
  //     couponCode: savedOrder.couponCode?.toString() || "",
  //     instructions: savedOrder.instructions?.toString() || "",
  //     createdAt: savedOrder.createdAt?.toISOString() || "",
  //     updatedAt: savedOrder.updatedAt?.toISOString() || "",
  //   };

  //   // Send response
  //   return res.status(201).json({
  //     message: "Order placed successfully",
  //     messageType: "success",
  //     order: formattedOrder,
  //   });
  // } catch (err) {
  //   console.error("Error placing order:", err);
  //   res.status(500).json({
  //     message: "Error placing order",
  //     messageType: "failure",
  //     error: err.message,
  //   });
  // }
};

// Get Order by ID
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate(
      "customerId restaurantId orderItems.productId"
    );

    if (!order) return res.status(404).json({ error: "Order not found" });

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Error fetching order" });
  }
};


exports.getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        message: "Invalid order ID format",
        messageType: "failure"
      });
    }

    const order = await Order.findById(orderId)
      .populate('customerId', 'name email phone')
      .populate('restaurantId', 'name logo address')
      .populate('orderItems.productId', 'name images')
      .populate('assignedAgent', 'fullName phoneNumber vehicleType')
      .populate('offerId', 'title description')
      .lean();

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
        messageType: "failure"
      });
    }

    // Format the response
    const response = {
      orderId: order._id,
      customer: order.customerId,
      restaurant: {
        id: order.restaurantId._id,
        name: order.restaurantId.name,
        logo: order.restaurantId.logo,
        address: order.restaurantId.address
      },
      items: order.orderItems.map(item => ({
        productId: item.productId?._id,
        name: item.name || item.productId?.name,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
        image: item.image || item.productId?.images?.[0]
      })),
      status: {
        current: order.orderStatus,
        agentAssignment: order.agentAssignmentStatus,
        payment: order.paymentStatus,
        isAgentAssigned: !!order.assignedAgent // Flag to show if agent is assigned (1 or 0)
      },
      timeline: {
        orderTime: order.orderTime,
        deliveryTime: order.deliveryTime,
        preparationTime: order.preparationTime,
        estimatedDeliveryTime: order.deliveryTime
      },
      payment: {
        method: order.paymentMethod,
        amount: order.totalAmount,
        onlineDetails: order.paymentMethod === 'online' ? {
          razorpayOrderId: order.onlinePaymentDetails?.razorpayOrderId,
          status: order.onlinePaymentDetails?.verificationStatus
        } : null,
        walletUsed: order.walletUsed
      },
      // Separate agent details object (null if no agent assigned)
      agentDetails: order.assignedAgent ? {
        id: order.assignedAgent._id,
        name: order.assignedAgent.fullName,
        phone: order.assignedAgent.phoneNumber,
        vehicleType: order.assignedAgent.vehicleType
      } : null,
      delivery: {
        address: order.deliveryAddress,
        location: order.deliveryLocation,
        mode: order.deliveryMode
      },
      offers: order.offerId ? {
        id: order.offerId._id,
        name: order.offerName || order.offerId.title,
        discount: order.offerDiscount
      } : null,
      charges: {
        subtotal: order.subtotal,
        tax: order.tax,
        delivery: order.deliveryCharge,
        surge: order.surgeCharge,
        tip: order.tipAmount,
        discount: order.discountAmount,
        total: order.totalAmount
      },
      metadata: {
        distance: order.distanceKm,
        instructions: order.instructions,
        couponCode: order.couponCode
      }
    };

    res.status(200).json({
      message: "Order details retrieved successfully",
      messageType: "success",
      order: response
    });

  } catch (err) {
    console.error("Error fetching order details:", err);
    res.status(500).json({
      message: "Failed to retrieve order details",
      messageType: "failure",
      error: err.message
    });
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

    // Fetch orders and total count in parallel
    const [orders, total] = await Promise.all([
      Order.find({ customerId, ...statusFilter })
        .populate("restaurantId", "name images")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ customerId, ...statusFilter }),
    ]);

    // Transform the orders into clean format
    const formattedOrders = orders.map((order) => ({
      orderId: order._id.toString(),
      restaurant: {
        id: order.restaurantId?._id?.toString() || "",
        name: order.restaurantId?.name || "",
        image: order.restaurantId?.images[0] || "",
      },
      orderStatus: order.orderStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount?.toString() || "0",
      deliveryCharge: order.deliveryCharge?.toString() || "0",
      tax: order.tax?.toString() || "0",
      tipAmount: order.tipAmount?.toString() || "0",
      distanceKm: order.distanceKm?.toString() || "0",
      createdAt: order.createdAt.toISOString(),
      deliveryAddress: {
        displayName: order.deliveryAddress?.displayName || "",
        street: order.deliveryAddress?.street || "",
        area: order.deliveryAddress?.area || "",
        landmark: order.deliveryAddress?.landmark || "",
        city: order.deliveryAddress?.city || "",
        pincode: order.deliveryAddress?.pincode || "",
        country: order.deliveryAddress?.country || "India",
      },
      items: order.orderItems.map((item) => ({
        productId: item.productId?.toString() || "",
        name: item.name,
        quantity: item.quantity,
        totalPrice: item.totalPrice?.toString() || "0",
        image: item.image[0] || "",
      })),
    }));

    // Send response
    return res.status(200).json({
      success: true,
      message: "Orders fetched successfully",
      messageType: "success",
      count: formattedOrders.length,
      orders: formattedOrders,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (err) {
    console.error("Error fetching orders:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      messageType: "failure",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
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
    res
      .status(500)
      .json({ message: "Server error while fetching order status" });
  }
};
exports.getOrderPriceSummary = async (req, res) => {
  try {
    const { longitude, latitude, couponCode, cartId, tipAmount = 0 } = req.body;
    const userId = req.user._id;

    if (!cartId || !userId) {
      return res.status(400).json({
        message: "cartId and userId are required",
        messageType: "failure",
      });
    }

    const cart = await Cart.findOne({ _id: cartId, user: userId });
    if (!cart) {
      return res.status(404).json({
        message: "Cart not found for this user",
        messageType: "failure",
      });
    }

    if (!cart.products || cart.products.length === 0) {
      return res.status(400).json({
        message: "Cart is empty",
        messageType: "failure",
      });
    }

    const restaurant = await Restaurant.findById(cart.restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
        messageType: "failure",
      });
    }

    const userCoords = [parseFloat(longitude), parseFloat(latitude)];
    const restaurantCoords = restaurant.location.coordinates;

    const preSurgeOrderAmount = cart.products.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );

    const surgeObj = await getApplicableSurgeFee(userCoords, preSurgeOrderAmount);
    const isSurge = !!surgeObj;
    const surgeFeeAmount = surgeObj ? surgeObj.fee : 0;

    const deliveryFee = await feeService.calculateDeliveryFee(
      restaurantCoords,
      userCoords
    );

    const offers = await Offer.find({
      applicableRestaurants: restaurant._id,
      isActive: true,
      validFrom: { $lte: new Date() },
      validTill: { $gte: new Date() },
    }).lean();

    const foodTax = await feeService.getActiveTaxes("food");

    const costSummary = calculateOrderCostV2({
      cartProducts: cart.products,
      tipAmount,
      couponCode,
      restaurantCoords,
      deliveryFee: deliveryFee,
      userCoords,
      offers,
      revenueShare: { type: "percentage", value: 20 },
      taxes: foodTax,
      isSurge,
      surgeFeeAmount,
    });

    const distanceKm = turf.distance(
      turf.point(userCoords),
      turf.point(restaurantCoords),
      { units: "kilometers" }
    );
     const isOffer = costSummary.offersApplied.length > 0 ? "1" : "0";
    // ✅ Convert all values to string or 1/0 for booleans for Flutter-friendly format
    const summary = {
      deliveryFee: costSummary.deliveryFee.toFixed(2),
      discount: costSummary.offerDiscount.toFixed(2),
      distanceKm: distanceKm.toFixed(2),
      subtotal: costSummary.cartTotal.toFixed(2),
      tax: costSummary.totalTaxAmount.toFixed(2),
      totalTaxAmount: costSummary.totalTaxAmount.toFixed(2),
      surgeFee: costSummary.surgeFee.toFixed(2),
      total: costSummary.finalAmount.toFixed(2),
      tipAmount: costSummary.tipAmount.toFixed(2),
      isSurge: isSurge ? "1" : "0",
      surgeReason: surgeObj ? surgeObj.reason : "",
      offersApplied: costSummary.offersApplied.length
        ? costSummary.offersApplied.join(", ")
        : "",
      isOffer: isOffer, 
      taxes: costSummary.taxBreakdown.map((tax) => ({
        name: tax.name,
        percentage: tax.percentage.toFixed(2),
        amount: tax.amount.toFixed(2),
      })),
    };

    return res.status(200).json({
      message: "Bill summary calculated successfully",
      messageType: "success",
      data: summary,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Server error",
      messageType: "failure",
    });
  }
};

exports.getOrderPriceSummaryByaddressId = async (req, res) => {
  try {
    const { addressId } = req.params;
    const { couponCode, cartId, userId } = req.body;

    if (!cartId || !userId || !addressId) {
      return res.status(400).json({
        message: "cartId, userId, and addressId are required",
        messageType: "failure",
      });
    }

    // Find user and their address
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        messageType: "failure",
      });
    }

    // Find the specific address
    const address = user.addresses.id(addressId);
    if (!address || !address.location || !address.location.coordinates) {
      return res.status(404).json({
        message: "Address not found or invalid location data",
        messageType: "failure",
      });
    }

    const cart = await Cart.findOne({ _id: cartId, user: userId });
    if (!cart) {
      return res.status(404).json({
        message: "Cart not found for this user",
        messageType: "failure",
      });
    }

    if (!cart.products || cart.products.length === 0) {
      return res.status(400).json({
        message: "Cart is empty",
        messageType: "failure",
      });
    }

    const restaurant = await Restaurant.findById(cart.restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
        messageType: "failure",
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
      messageType: "failure",
    });
  }
};
exports.getPastOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(userId)

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        messageType: "failure",
        message: "Invalid user ID.",
        data: null
      });
    }
   
    // Fetch delivered and cancelled orders only
    const pastOrders = await Order.find({
      customerId: userId,
      orderStatus: { $in: ['delivered', 'cancelled_by_customer'] }
    })
      .populate({
        path: "restaurantId",
        select: "name location address"
      })
      .sort({ createdAt: -1 })
      .lean();

    if (!pastOrders || pastOrders.length === 0) {
      return res.status(200).json({
        success: true,
        messageType: "success",
        message: "No past orders found.",
        data: {
          orders: []
        }
      });
    }

    // Format response
    const formattedOrders = pastOrders.map(order => {
      const addressObj = order.restaurantId?.address;
      const fullAddress = addressObj
        ? [
            addressObj.street,
            addressObj.area,
            addressObj.city,
            addressObj.state,
            addressObj.pincode,
            addressObj.country
          ].filter(Boolean).join(", ")
        : "N/A";

      // Map status for frontend numeric value
      let displayStatus = null;
  if (order.orderStatus === 'delivered') {
    displayStatus = "1";
  } else if (order.orderStatus === 'cancelled_by_customer') {
    displayStatus = "0";
  }

      return {
        orderId: order._id,
        restaurant: {
          name: order.restaurantId?.name || "N/A",
          address: fullAddress,
          location: order.restaurantId?.location?.coordinates || []
        },
        orderDate: order.orderTime,
        orderTime: order.orderTime,
        orderStatus: displayStatus,   // 👈 numeric value here
        orderItems: order.orderItems.map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          totalPrice: item.totalPrice,
          image: item.image
        })),
        totalAmount: order.totalAmount
      };
    });

    return res.status(200).json({
      success: true,
      messageType: "success",
      message: "Past orders fetched successfully.",
      data: {
        orders: formattedOrders
      }
    });

  } catch (err) {
    console.error("Error fetching past orders:", err);
    res.status(500).json({
      success: false,
      messageType: "failure",
      message: "Server error while fetching past orders.",
      data: null
    });
  }
};





// Get user's past delivered and canceled orders

// exports.getPastOrders = async (req, res) => {
//   try {
//     const userId = req.user._id;

//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       return res.status(400).json({
//         success: "0",
//         message: "Invalid user ID",
//         messageType: "failure",
//       });
//     }

//     const pastOrders = await Order.find({
//       customerId: userId,
//       orderStatus: {
//         $in: ["completed", "cancelled_by_customer", "rejected_by_restaurant"],
//       },
//     })
//       .sort({ orderTime: -1 })
//       .populate("restaurantId", "name images")
//       .populate("orderItems.productId", "name images price");

//     if (!pastOrders || pastOrders.length === 0) {
//       return res.json({
//         success: "1",
//         message: "No past orders found",
//         messageType: "success",
//         count: "0",
//         orders: [],
//       });
//     }

//     // Get unique restaurant IDs
//     const restaurantIds = [
//       ...new Set(pastOrders.map((order) => order.restaurantId._id.toString())),
//     ];

//     const availabilityPromises = restaurantIds.map((restaurantId) =>
//       restaurantService.checkStatus(restaurantId)
//     );
//     const availabilityResults = await Promise.all(availabilityPromises);

//     const restaurantAvailability = {};
//     restaurantIds.forEach((id, index) => {
//       restaurantAvailability[id] = availabilityResults[index];
//     });

//     const formattedOrders = await Promise.all(
//       pastOrders.map(async (order) => {
//         const availability =
//           restaurantAvailability[order.restaurantId._id.toString()] || {};
//         const deliveryAddress = order.deliveryAddress || {};

//         const itemsWithAvailability = await Promise.all(
//           order.orderItems.map(async (item) => {
//             const productAvailability =
//               await productService.checkProductAvailability(
//                 item.productId?._id
//               );
//             console.log(item.productId);
//             return {
//               productId: item.productId?._id
//                 ? item.productId._id.toString()
//                 : "null",
//               name: item.productId?.name ? String(item.productId.name) : "null",
//               image: item.productId?.images[0]
//                 ? String(item.productId.images[0])
//                 : "null",
//               quantity: item.quantity ? String(item.quantity) : "0",
//               price: item.price ? String(item.price) : "0",
//               isAvailableNow: productAvailability.isAvailable ? "1" : "0",
//               unavailableReason: productAvailability.reason || null,
//             };
//           })
//         );

//         return {
//           orderId: order._id.toString(),
//           restaurant: {
//             id: order.restaurantId._id.toString(),
//             name: order.restaurantId.name
//               ? String(order.restaurantId.name)
//               : "null",
//             image: order.restaurantId.images
//               ? String(order.restaurantId.images)
//               : "null",
//             isAvailable: availability.isAvailable ? "1" : "0",
//             nonAvailabilityReason: availability.reason || null, // <-- corrected line
//             nextOpeningTime: availability.nextOpeningTime || null,
//           },
//           orderTime: order.orderTime ? order.orderTime.toISOString() : "null",
//           deliveryTime: order.deliveryTime
//             ? order.deliveryTime.toISOString()
//             : "18 mins",
//           status: order.orderStatus ? String(order.orderStatus) : "null",
//           cancellationReason: order.cancellationReason
//             ? String(order.cancellationReason)
//             : "null",
//           items: itemsWithAvailability,
//           totalAmount: order.totalAmount ? String(order.totalAmount) : "0",
//           deliveryCharge: order.deliveryCharge
//             ? String(order.deliveryCharge)
//             : "0",
//         };
//       })
//     );

//     res.json({
//       success: "1",
//       message: "Past orders retrieved successfully",
//       messageType: "success",
//       count: pastOrders.length.toString(),
//       orders: formattedOrders,
//     });
//   } catch (error) {
//     console.error("Error fetching past orders:", error);
//     res.status(500).json({
//       success: "0",
//       message: "Internal server error",
//       messageType: "failure",
//     });
//   }
// };







exports.placeOrderV2 = async (req, res) => {
  try {
    const {
      longitude,
      latitude,
      cartId,
      paymentMethod,
      couponCode,
      instructions,
      tipAmount = 0,
      street,
      area,
      landmark,
      city,
      state,
      pincode,
      country = "India",
    } = req.body;
    const userId = req.user._id;

    // Basic validation
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
      return res.status(400).json({
        message: "Required fields are missing",
        messageType: "failure",
      });
    }

    // Find cart and restaurant
    const cart = await Cart.findOne({ _id: cartId, user: userId });
    if (!cart) {
      return res.status(404).json({
        message: "Cart not found",
        messageType: "failure",
      });
    }

    const restaurant = await Restaurant.findById(cart.restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
        messageType: "failure",
      });
    }

    const userCoords = [parseFloat(longitude), parseFloat(latitude)];
    const restaurantCoords = restaurant.location.coordinates;
    const preSurgeOrderAmount = cart.products.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );

    const offers = await Offer.find({
      applicableRestaurants: restaurant._id,
      isActive: true,
      validFrom: { $lte: new Date() },
      validTill: { $gte: new Date() },
    }).lean();

    const surgeObj = await getApplicableSurgeFee(
      userCoords,
      preSurgeOrderAmount
    );

    const isSurge = !!surgeObj;
    const surgeFeeAmount = surgeObj ? surgeObj.fee : 0;

    const deliveryFee = await feeService.calculateDeliveryFee(
      restaurantCoords,
      userCoords
    );
    const foodTax = await feeService.getActiveTaxes("food");

    const costSummary = calculateOrderCostV2({
      cartProducts: cart.products,
      tipAmount,
      couponCode,
      deliveryFee,
      offers,
      revenueShare: { type: "percentage", value: 20 },
      taxes: foodTax,
      isSurge,
      surgeFeeAmount,
    });

    // Calculate bill summary
    const billSummary = calculateOrderCost({
      cartProducts: cart.products,
      restaurant,
      userCoords,
      couponCode,
    });

    // Map order items with product images
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

    // Determine initial order status based on restaurant permissions
    let orderStatus = "pending";
    const permission = await Permission.findOne({
      restaurantId: restaurant._id,
    });
    if (permission && !permission.permissions.canAcceptOrder) {
      orderStatus = "accepted_by_restaurant";
    }

    // Create and save order
    const newOrder = new Order({
      customerId: userId,
      restaurantId: cart.restaurantId,
      orderItems,
      paymentMethod,
      orderStatus: orderStatus,
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
      subtotal: costSummary.cartTotal, // ✅ from V2
      cartTotal: costSummary.cartTotal,
      tax: costSummary.totalTaxAmount, // ✅ from V2
      discountAmount: costSummary.offerDiscount + costSummary.couponDiscount, // ✅ clean combined discount
      deliveryCharge: costSummary.deliveryFee, // ✅ from V2
      offerId: costSummary.appliedOffer?._id || null,
      offerName: costSummary.appliedOffer?.title || null,
      offerDiscount: costSummary.offerDiscount,
      surgeCharge: costSummary.surgeFee,
      tipAmount,
      totalAmount: costSummary.finalAmount, // ✅ final payable
      couponCode,
      isSurge: costSummary.isSurge,
      surgeReason: costSummary.surgeReason,
      agentAssignmentStatus: "not_assigned",
      instructions: instructions,
    });

    const savedOrder = await newOrder.save();
    const io = req.app.get("io");
    const populatedOrder = await Order.findById(savedOrder._id)
      .populate("customerId", "name email phone")
      .lean();

    const sanitizeOrderNumbers = (order, fields) => {
      fields.forEach((key) => {
        order[key] = Number(order[key]) || 0;
      });
      return order;
    };

    sanitizeOrderNumbers(populatedOrder, [
      "subtotal",
      "tax",
      "discountAmount",
      "deliveryCharge",
      "offerDiscount",
      "surgeCharge",
      "tipAmount",
      "totalAmount",
    ]);

    console.log(populatedOrder);

    io.to(`restaurant_${savedOrder.restaurantId.toString()}`).emit(
      "new_order",
      populatedOrder
    );
    // Try to assign an agent
    let assignmentResult;
    try {
      assignmentResult = await assignTask(savedOrder._id);
      console.log("Agent assignment result:", assignmentResult);

      console.log(`Emitting to restaurant_${savedOrder.restaurantId}`);
      //   const updatedOrder = await Order.findByIdAndUpdate(orderId, {
      //     $set: { assignedAgent: agentId, agentAssignmentStatus: "accepted", agentAcceptedAt: new Date() }
      //   })
      //   .populate("customerId", "name email")
      //   .populate("assignedAgent", "fullName phoneNumber email")

      // const orderObj = updatedOrder.toObject();

      if (assignmentResult.success) {
        // Update only agent assignment fields, not main order status

        //  io.to(`restaurant_${orderObj.restaurantId}`).emit("new_order", {
        //   success: true,
        //   message: "Agent assigned to order",
        //   updateType: "agent_assigned",
        //   order: mapOrder(orderObj)
        // });

        // Notify all parties about assignment (not pickup)
        io.to(`agent_${assignmentResult.agentId}`).emit("delivery_assigned", {
          orderId: savedOrder._id,
          action: "assignment",
          status: "assigned",
        });

        io.to(`user_${savedOrder.customerId}`).emit("order_update", {
          orderId: savedOrder._id,
          updateType: "agent_assigned",
          agentId: assignmentResult.agentId,
          currentStatus: savedOrder.orderStatus, // Original status remains
        });

        io.to(`restaurant_${savedOrder.restaurantId}`).emit("order_update", {
          orderId: savedOrder._id,
          updateType: "agent_assigned",
          agentId: assignmentResult.agentId,
        });

        // Send appropriate notifications
        await sendPushNotification(
          savedOrder.customerId,
          "Delivery Agent Assigned",
          "An agent has been assigned to your order"
        );

        await sendPushNotification(
          assignmentResult.agentId,
          "New Delivery Assignment",
          "You have been assigned a new delivery"
        );
      } else {
        // No agent available - update only assignment status
      }
    } catch (error) {
      console.error("Error during agent assignment:", error);
      await Order.findByIdAndUpdate(savedOrder._id, {
        $set: {
          agentAssignmentStatus: "awaiting_agent_assignment",
        },
      });
    }

    // Fetch the latest order state
    const currentOrder = await Order.findById(savedOrder._id);

    return res.status(201).json({
      message: "Order placed successfully",
      orderId: currentOrder._id,
      totalAmount: currentOrder.totalAmount,
      billSummary,
      orderStatus: currentOrder.orderStatus, // Original status (not changed to assigned_to_agent)
      agentAssignmentStatus: currentOrder.agentAssignmentStatus,
      assignedAgent: currentOrder.assignedAgent,
      messageType: "success",
    });
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).json({
      message: "Failed to place order",
      messageType: "failure",
      error: err.message,
    });
  }
};





exports.placeOrderWithAddressId = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      cartId,
      paymentMethod,
      addressId,
      couponCode,
      instructions,
      tipAmount = 0,
    } = req.body;

    if (!cartId || !paymentMethod || !addressId) {
      return res.status(400).json({
        message: "Missing required fields",
        messageType: "failure",
      });
    }

    // Fetch user and address
    const user = await User.findById(userId).select("addresses");
    if (!user) return res.status(404).json({ message: "User not found" });

    const selectedAddress = user.addresses.id(addressId);
    if (!selectedAddress)
      return res.status(404).json({ message: "Address not found" });

    const [userLongitude, userLatitude] = selectedAddress.location.coordinates;

    // Fetch cart
    const cart = await Cart.findById(cartId);
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    // Fetch restaurant
    const restaurant = await Restaurant.findById(cart.restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found for this cart",
        messageType: "failure",
      });
    }

    const [restaurantLongitude, restaurantLatitude] = restaurant.location.coordinates;

    // Calculate bill
    const cartProducts = cart.products.map((item) => ({
      price: item.price,
      quantity: item.quantity,
    }));

    const bill = calculateOrderCostV2({
      cartProducts,
      tipAmount,
      couponCode,
      restaurantCoords: { latitude: restaurantLatitude, longitude: restaurantLongitude },
      userCoords: { latitude: userLatitude, longitude: userLongitude },
      offers: await Offer.find({ _id: { $in: restaurant.offers }, active: true }),
      revenueShare: restaurant.commission,
      taxRate: 5,
      isSurge: restaurant.isSurge || false,
    });

    // Check permission
    let orderStatus = "pending";
    const permission = await Permission.findOne({ restaurantId: restaurant._id });
    if (permission && !permission.permissions.canAcceptOrder) {
      orderStatus = "accepted_by_restaurant";
    }

    // Create order
    const newOrder = new Order({
      customerId: userId,
      restaurantId: restaurant._id,
      orderItems: cart.products,
      orderStatus,
      subtotal: bill.cartTotal,
      discountAmount: bill.offerDiscount,
      tax: bill.taxAmount,
      deliveryCharge: bill.deliveryFee,
      totalAmount: bill.finalAmount,
      tipAmount,
      paymentMethod,
      paymentStatus: "pending",
      deliveryLocation: {
        type: "Point",
        coordinates: [userLongitude, userLatitude],
      },
      deliveryAddress: {
        street: selectedAddress.street,
        area: selectedAddress.area || "",
        landmark: selectedAddress.landmark || "",
        city: selectedAddress.city,
        state: selectedAddress.state || "",
        pincode: selectedAddress.pincode || "000000",
        country: selectedAddress.country || "India",
      },
      instructions,
      couponCode,
      distanceKm: bill.distanceKm || 0,
    });

    await newOrder.save();

    // If online payment — create Razorpay order and return immediately
    if (paymentMethod === "online") {
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(bill.finalAmount * 100),
        currency: "INR",
        receipt: newOrder._id.toString(),
        notes: {
          restaurantName: restaurant.name,
          userId: userId.toString(),
          orderId: newOrder._id.toString(),
        },
      });

      newOrder.onlinePaymentDetails.razorpayOrderId = razorpayOrder.id;
      await newOrder.save();

      return res.status(200).json({
        message: "Order created. Proceed to payment.",
        messageType: "success",
        orderId: newOrder._id,
        razorpayOrderId: razorpayOrder.id,
        amount: bill.finalAmount,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID,
      });
    }

    // If COD → assign agent immediately
    try {
      const assignmentResult = await assignTask(newOrder._id);

      if (assignmentResult.status !== "assigned") {
        console.warn("⚠️ Agent assignment pending:", assignmentResult.reason || assignmentResult.error);
      } else {
        console.log(`✅ Agent ${assignmentResult.agent.fullName} assigned`);
      }
       await Cart.findByIdAndDelete(cartId);

    } catch (error) {
      console.error("❌ Error during agent assignment:", error);
    }

    // Final response for COD order
    return res.status(201).json({
      message: "Order placed successfully",
      messageType: "success",
      orderId: newOrder._id,
      bill: bill,
    });

  } catch (error) {
    console.error("❌ Order placement error:", error);
    return res.status(500).json({
      message: "Internal server error while placing order",
      messageType: "failure",
      error: error.message,
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !orderId
    ) {
      return res
        .status(400)
        .json({ message: "Missing payment details", messageType: "failure" });
    }

    // 1️⃣ Generate expected signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    // 2️⃣ Compare
    if (generatedSignature !== razorpay_signature) {
      await Order.findByIdAndUpdate(orderId, {
        $set: {
          "onlinePaymentDetails.verificationStatus": "failed",
          "onlinePaymentDetails.failureReason": "Invalid signature",
        },
      });

      return res
        .status(400)
        .json({ message: "Invalid payment signature", messageType: "failure" });
    }

    // 3️⃣ Update order payment status
    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ message: "Order not found", messageType: "failure" });
    }

    order.paymentStatus = "completed";
    order.onlinePaymentDetails = {
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      verificationStatus: "verified",
    };
    await order.save();

  if (order.cartId) {
  await Cart.findByIdAndDelete(order.cartId);
}

    // 4️⃣ Trigger task allocation after payment verification
    const allocationResult = await assignTask(orderId);
    console.log("🚚 Allocation Result after payment:", allocationResult);

   return res.status(200).json({
  message: "✅ Payment verified and order confirmed.",
  messageType: "success",
  orderId: order._id,
  paymentStatus: order.paymentStatus,
  allocation: {
    status: allocationResult.status,
    agentId: allocationResult.agent ? allocationResult.agent._id : null,
    agentName: allocationResult.agent ? allocationResult.agent.fullName : null,
    reason: allocationResult.reason || allocationResult.error || null,
  },
  nextSteps: paymentMethod === "online"
    ? "Order is now being processed, agent will be assigned shortly."
    : "Awaiting agent assignment.",
})
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({
      message: "Failed to verify payment",
      messageType: "failure",
      error: err.message,
    });
  }
};





exports.getActiveOrder = async (req, res) => {
  try {
  
        const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const activeOrderStatuses = [
      "pending",
      "pending_agent_acceptance",
      "accepted_by_restaurant",
      "preparing",
      "ready",
      "assigned_to_agent",
      "picked_up",
      "on_the_way",
      "in_progress",
      "arrived"
    ];

    const activeOrder = await Order.findOne({
      customerId: userId,
      orderStatus: { $in: activeOrderStatuses }
    })
      .sort({ createdAt: -1 })
      .populate("restaurantId")
      .populate("assignedAgent")
      .exec();

    if (!activeOrder) {
      return res.status(404).json({ message: "No active order found" });
    }

    // Get customer details
    const customer = await User.findById(activeOrder.customerId).select("name email phone");

    // Build response object
    const response = {
      _id: activeOrder._id,
      customer: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone
      },
      restaurant: {
        id: activeOrder.restaurantId._id,
        name: activeOrder.restaurantId.name,
        address: activeOrder.restaurantId.address
      },
      orderItems: activeOrder.orderItems,
      orderStatus: activeOrder.orderStatus,
      assignedAgent: activeOrder.assignedAgent
        ? {
            _id: activeOrder.assignedAgent._id,
            name: activeOrder.assignedAgent.name,
            phone: activeOrder.assignedAgent.phone
          }
        : null,
      isAgentAssigned: activeOrder.assignedAgent ? 1 : 0,
      subtotal: activeOrder.subtotal,
      orderTime: activeOrder.orderTime
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("Error fetching active order:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
