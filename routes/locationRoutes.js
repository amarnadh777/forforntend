const express = require('express');
const router = express.Router();
const {getNearbyRestaurants,getNearbyCategories} = require('../controllers/locationControllers')
router.get("/nearby-restaurants",getNearbyRestaurants)
router.get("/nearby-categories",getNearbyCategories)
module.exports = router;