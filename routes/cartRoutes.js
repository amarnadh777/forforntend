const express = require('express');
const { addToCart, getCart, updateCartItem, removeFromCart, clearCart,addMultipleToCart } = require('../controllers/cartController');
const router = express.Router();
const {protect} = require("../middlewares/authMiddleware")

router.post('/add', protect, addToCart);
router.get('/', protect, getCart);
router.put('/update', updateCartItem);
router.delete('/remove', removeFromCart);
router.delete('/clear/:userId', clearCart);






module.exports = router;
