const Order = require("../models/orderModel");
const Cart = require("../models/cartModel")
const Restaurant = require("../models/restaurantModel")
const User = require("../models/userModel")
const { calculateOrderCost} = require("../services/orderCostCalculator")

// Create Orderconst Product = require("../models/FoodItem"); // Your product model
const mongoose = require("mongoose")
const Product = require("../models/productModel")
const  restaurantService = require("../services/restaurantService")
const productService = require("../services/productService")
const  isLocationInServiceArea = require("../services/isLocationInServiceArea")
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
;


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
      pincode,
      country = "India",
    } = req.body;

    // Basic validation
    if (!cartId || !userId || !paymentMethod || !longitude || !latitude || !street || !city || !pincode) {
      return res.status(400).json({ 
        message: "Required fields are missing",
        messageType: "failure" 
      });
    } 





    if (isNaN(parseFloat(longitude)) || isNaN(parseFloat(latitude))) {
  return res.status(400).json({
    message: "Invalid coordinates provided",
    messageType: "failure"
  });
}

const userCoords = [parseFloat(longitude), parseFloat(latitude)];

// Validate coordinate ranges
if (userCoords[0] < -180 || userCoords[0] > 180 || 
    userCoords[1] < -90 || userCoords[1] > 90) {
  return res.status(400).json({
    message: "Coordinates out of valid range (longitude: -180 to 180, latitude: -90 to 90)",
    messageType: "failure"
  });
}







    // Find cart and restaurant
    const cart = await Cart.findOne({ _id: cartId, user: userId });
    
    if (!cart) {
      return res.status(404).json({ 
        message: "Cart not found",
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

//     const isInserviceArea = await isLocationInServiceArea(restaurant._id,longitude, latitude)
   


//     if (!isInserviceArea) {
//   return res.status(400).json({
//     message: "Sorry, this restaurant does not deliver to your location.",
//     messageType: "failure",
//   });
// }
  
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

    // Create and save order
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

    // Clear the cart after successful order placement
    await Cart.findByIdAndDelete(cartId);




    // Format order data to string values
const formattedOrder = {
  _id: savedOrder._id?.toString() || "",
  customerId: savedOrder.customerId?.toString() || "",
  restaurantId: savedOrder.restaurantId?.toString() || "",
  orderItems: savedOrder.orderItems.map((item) => ({
    productId: item.productId?.toString() || "",
    quantity: item.quantity?.toString() || "0",
    price: item.price?.toString() || "0",
    name: item.name?.toString() || "",
    totalPrice: item.totalPrice?.toString() || "0",
    image: item.image ? item.image.toString() : "",
  })),
  paymentMethod: savedOrder.paymentMethod?.toString() || "",
  orderStatus: savedOrder.orderStatus?.toString() || "",
  deliveryLocation: {
    type: savedOrder.deliveryLocation?.type?.toString() || "",
    coordinates: savedOrder.deliveryLocation?.coordinates?.map(coord => coord?.toString() || "0") || [],
  },
  deliveryAddress: {
    street: savedOrder.deliveryAddress?.street?.toString() || "",
    area: savedOrder.deliveryAddress?.area?.toString() || "",
    landmark: savedOrder.deliveryAddress?.landmark?.toString() || "",
    city: savedOrder.deliveryAddress?.city?.toString() || "",
    state: savedOrder.deliveryAddress?.state?.toString() || "",
    pincode: savedOrder.deliveryAddress?.pincode?.toString() || "",
    country: savedOrder.deliveryAddress?.country?.toString() || "",
    latitude: savedOrder.deliveryAddress?.latitude?.toString() || "",
    longitude: savedOrder.deliveryAddress?.longitude?.toString() || "",
  },
  subtotal: savedOrder.subtotal?.toString() || "0",
  tax: savedOrder.tax?.toString() || "0",
  discountAmount: savedOrder.discountAmount?.toString() || "0",
  deliveryCharge: savedOrder.deliveryCharge?.toString() || "0",
  surgeCharge: savedOrder.surgeCharge?.toString() || "0",
  tipAmount: savedOrder.tipAmount?.toString() || "0",
  totalAmount: savedOrder.totalAmount?.toString() || "0",
  distanceKm: savedOrder.distanceKm?.toString() || "0",
  couponCode: savedOrder.couponCode?.toString() || "",
  instructions: savedOrder.instructions?.toString() || "",
  createdAt: savedOrder.createdAt?.toISOString() || "",
  updatedAt: savedOrder.updatedAt?.toISOString() || "",
};


// Send response
return res.status(201).json({
  message: "Order placed successfully",
  messageType: "success",
  order: formattedOrder
});


 
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).json({ 
      message: "Error placing order",
      messageType: "failure",
      error: err.message 
    });
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










// Get user's past delivered and canceled orders

exports.getPastOrders = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: "0",
        message: 'Invalid user ID',
        messageType: "failure"
      });
    }

    const pastOrders = await Order.find({
      customerId: userId,
      orderStatus: { $in: ['completed', 'cancelled_by_customer', 'rejected_by_restaurant'] }
    })
    .sort({ orderTime: -1 })
    .populate('restaurantId', 'name images').populate('orderItems.productId', 'name images price');

  

    if (!pastOrders || pastOrders.length === 0) {
      return res.json({
        success: "1",
        message: 'No past orders found',
        messageType: "success",
        count: "0",
        orders: []
      });
    }

    // Get unique restaurant IDs
    const restaurantIds = [...new Set(pastOrders.map(order => order.restaurantId._id.toString()))];

    const availabilityPromises = restaurantIds.map(restaurantId =>
      restaurantService.checkStatus(restaurantId)
    );
    const availabilityResults = await Promise.all(availabilityPromises);

    const restaurantAvailability = {};
    restaurantIds.forEach((id, index) => {
      restaurantAvailability[id] = availabilityResults[index];
    });

    const formattedOrders = await Promise.all(pastOrders.map(async (order) => {
      const availability = restaurantAvailability[order.restaurantId._id.toString()] || {};
      const deliveryAddress = order.deliveryAddress || {};

      const itemsWithAvailability = await Promise.all(
        order.orderItems.map(async (item) => {
          const productAvailability = await productService.checkProductAvailability(item.productId?._id);
          console.log(item.productId)
          return {
            productId: item.productId?._id ? item.productId._id.toString() : "null",
            name: item.productId?.name ? String(item.productId.name) : "null",
            image: item.productId?.images[0] ? String(item.productId.images[0]) : "null",
            quantity: item.quantity ? String(item.quantity) : "0",
            price: item.price ? String(item.price) : "0",
            isAvailableNow: productAvailability.isAvailable ? "1" : "0",
            unavailableReason: productAvailability.reason || null
          };
        })
      );

      return {
        orderId: order._id.toString(),
       restaurant: {
  id: order.restaurantId._id.toString(),
  name: order.restaurantId.name ? String(order.restaurantId.name) : "null",
  image: order.restaurantId.images ? String(order.restaurantId.images) : "null",
  isAvailable: availability.isAvailable ? "1" : "0",
  nonAvailabilityReason: availability.reason || null, // <-- corrected line
  nextOpeningTime: availability.nextOpeningTime || null
} ,
        orderTime: order.orderTime ? order.orderTime.toISOString() : "null",
        deliveryTime: order.deliveryTime ? order.deliveryTime.toISOString() : "18 mins",
        status: order.orderStatus ? String(order.orderStatus) : "null",
        cancellationReason: order.cancellationReason ? String(order.cancellationReason) : "null",
        items: itemsWithAvailability,
        totalAmount: order.totalAmount ? String(order.totalAmount) : "0",
        deliveryCharge: order.deliveryCharge ? String(order.deliveryCharge) : "0",


      };
    }));

    res.json({
      success: "1",
      message: 'Past orders retrieved successfully',
      messageType: "success",
      count: pastOrders.length.toString(),
      orders: formattedOrders
    });

  } catch (error) {
    console.error('Error fetching past orders:', error);
    res.status(500).json({
      success: "0",
      message: 'Internal server error',
      messageType: "failure"
    });
  }
};



