const Cart = require("../models/cartModel")
const Product = require('../models/productModel');
const { calculateOrderCost } = require("../services/orderCostCalculator");

const mongoose = require('mongoose')

exports.addToCart = async (req, res) => {
  const userId = req.user._id;
  const { restaurantId, products } = req.body;

  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw { status: 400, message: "Invalid userId format" };
    }
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      throw { status: 400, message: "Invalid restaurantId format" };
    }
    if (!products || !Array.isArray(products) || products.length === 0) {
      throw { status: 400, message: "Products must be a non-empty array" };
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      cart = new Cart({
        user: userId,
        restaurantId,
        products: []
      });
    } else if (cart.restaurantId.toString() !== restaurantId) {
      // Clear existing products if switching restaurant
      cart.products = [];
      cart.restaurantId = restaurantId;
    }

    for (const prod of products) {
      if (!prod.productId || !mongoose.Types.ObjectId.isValid(prod.productId)) continue;

      const productData = await Product.findById(prod.productId);
      if (!productData || productData.restaurantId.toString() !== restaurantId) continue;

      const index = cart.products.findIndex(p => p.productId.toString() === prod.productId);

      if (prod.quantity === 0) {
        // remove the product from cart
        if (index > -1) {
          cart.products.splice(index, 1);
        }
      } else {
        const newQty = (prod.quantity && prod.quantity > 0) ? prod.quantity : 1;
        const price = productData.price;

        if (index > -1) {
          cart.products[index].quantity = newQty;
          cart.products[index].total = newQty * price;
        } else {
          cart.products.push({
            productId: prod.productId,
            name: productData.name,
            price,
            quantity: newQty,
            total: price * newQty
          });
        }
      }
    }

    if (cart.products.length === 0) {
      throw { status: 400, message: "No valid products found to add to cart" };
    }

    cart.totalPrice = cart.products.reduce((sum, p) => sum + p.total, 0);
    await cart.save();

    return res.status(200).json({
      message: "Cart updated successfully",
      messageType: "success",
      data: cart
    });
  } catch (error) {
    console.error("Error inside addToCart service:", error);
    res.status(error.status || 500).json({
      message: error.message || "Something went wrong",
      messageType: "failure"
    });
  }
};


// Get user's cart
exports.getCart = async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(200).json({
        message: "Cart is empty",
        messageType: "success",
        data: { items: [] }
      });
    }

    res.status(200).json({
      message: "Cart fetched successfully",
      messageType: "success",
      cart
    });
  } catch (error) {
    console.error("Get Cart Error:", error);
    res.status(500).json({
      message: "Server error",
      messageType: "failure"
    });
  }
};

// Update item quantity
exports.updateCartItem = async (req, res) => {
  try {
    const { userId, productId, quantity } = req.body;

    if (!userId || !productId || quantity == null) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    if (itemIndex === -1) return res.status(404).json({ message: "Item not found in cart" });

    const pricePerUnit = cart.items[itemIndex].priceAtPurchase;
    const oldQty = cart.items[itemIndex].quantity;

    cart.items[itemIndex].quantity = quantity;

    // Update totals
    cart.totalQuantity += quantity - oldQty;
    cart.totalPrice += (quantity - oldQty) * pricePerUnit;

    await cart.save();

    res.status(200).json({ message: "Cart item updated", cart });
  } catch (error) {
    console.error("Update Cart Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
  try {
    const { userId, productId } = req.body;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    if (itemIndex === -1) return res.status(404).json({ message: "Item not found in cart" });

    const item = cart.items[itemIndex];
    cart.totalPrice -= item.priceAtPurchase * item.quantity;
    cart.totalQuantity -= item.quantity;

    cart.items.splice(itemIndex, 1);
    await cart.save();

    res.status(200).json({ message: "Item removed from cart", cart });
  } catch (error) {
    console.error("Remove from Cart Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Clear entire cart
exports.clearCart = async (req, res) => {
  try {
    const { userId } = req.params;

    const cart = await Cart.findOne({ user: userId });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = [];
    cart.totalPrice = 0;
    cart.totalQuantity = 0;
    cart.lastUpdated = new Date();

    await cart.save();

    res.status(200).json({ message: "Cart cleared", cart });
  } catch (error) {
    console.error("Clear Cart Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
