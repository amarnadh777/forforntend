const express = require('express');
const router = express.Router();
const {getNearbyRestaurants,getNearbyCategories,getNearbyCategoriesMock} = require('../controllers/locationControllers')
router.get("/nearby-restaurants",getNearbyRestaurants)
router.get("/nearby-categories",getNearbyCategoriesMock)
module.exports = router;