
const Restaurant = require("../models/restaurantModel")
const Category = require("../models/categoryModel")
const { categories, restaurants } = require('../mockData')
exports.getNearbyRestaurants = async (req, res) => {
  try {
    const { latitude, longitude, distance = 5000 } = req.query;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        message: "Latitude and longitude are required in query parameters.",
        messageType: "error",
        statusCode: 400
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const dist = parseFloat(distance);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({
        message: "Invalid latitude. Must be a number between -90 and 90.",
        messageType: "error",
        statusCode: 400
      });
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({
        message: "Invalid longitude. Must be a number between -180 and 180.",
        messageType: "error",
        statusCode: 400
      });
    }

    if (isNaN(dist) || dist <= 0) {
      return res.status(400).json({
        message: "Distance must be a positive number (in meters).",
        messageType: "error",
        statusCode: 400
      });
    }

    const restaurants = await Restaurant.find({
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          $maxDistance: dist,
        },
      },
      active: true,
    }).select("name address openingHours minOrderAmount foodType phone rating images ");

    res.status(200).json({
      message: "Nearby restaurants fetched successfully.",
      messageType: "success",
      statusCode: 200,
      count: restaurants.length,
      data: restaurants
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Server error while fetching nearby restaurants.",
      messageType: "error",
      statusCode: 500
    });
  }
};


exports.getNearbyCategories = async (req, res) => {
  try {
    const { latitude, longitude, distance = 5000 } = req.query;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        message: "Latitude and longitude are required in query parameters.",
        messageType: "failure",
        statusCode: 400,
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const dist = parseFloat(distance);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({
        message: "Invalid latitude. Must be a number between -90 and 90.",
        messageType: "failure",
        statusCode: 400,
      });
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({
        message: "Invalid longitude. Must be a number between -180 and 180.",
        messageType: "failure",
        statusCode: 400,
      });
    }

    if (isNaN(dist) || dist <= 0) {
      return res.status(400).json({
        message: "Distance must be a positive number (in meters).",
        messageType: "failure",
        statusCode: 400,
      });
    }

    // 1. Find nearby restaurants
    const nearbyRestaurants = await Restaurant.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: dist,
        },
      },
      active: true,
    }).select("_id");

    const restaurantIds = nearbyRestaurants.map(r => r._id);

    if (restaurantIds.length === 0) {
      return res.status(200).json({
        message: "No nearby restaurants found.",
        messageType: "success",
        statusCode: 200,
        count: 0,
        data: [],
      });
    }

    // 2. Find categories with those restaurantIds and active
    const categories = await Category.find({
      restaurantId: { $in: restaurantIds },
      active: true,
    });

    // Optional: Remove duplicate categories by name (if needed)
    const uniqueCategoriesMap = new Map();
    categories.forEach(cat => {
      if (!uniqueCategoriesMap.has(cat.name)) {
        uniqueCategoriesMap.set(cat.name, cat);
      }
    });

    const uniqueCategories = Array.from(uniqueCategoriesMap.values());

    // 3. Return cegories
    return res.status(200).json({
      message: "Nearby categories fetched successfully.",
      messageType: "success",
      statusCode: 200,
      count: uniqueCategories.length,
      data: uniqueCategories,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error while fetching nearby categories.",
      messageType: "error",
      statusCode: 500,
    });
  }
};





function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of earth in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
  ;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in meters
  return d;
}



// Utility to calculate distance between two lat-lng points (meters)
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of the earth in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in meters
  return d;
}

exports.getNearbyCategoriesMock = async (req, res) => {
  try {
    const { latitude, longitude, distance = 5000 } = req.query;

    // Validate coordinates
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        message: "Latitude and longitude are required in query parameters.",
        messageType: "failure",
        statusCode: 400,
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const dist = parseFloat(distance);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({
        message: "Invalid latitude. Must be a number between -90 and 90.",
        messageType: "failure",
        statusCode: 400,
      });
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({
        message: "Invalid longitude. Must be a number between -180 and 180.",
        messageType: "failure",
        statusCode: 400,
      });
    }

    if (isNaN(dist) || dist <= 0) {
      return res.status(400).json({
        message: "Distance must be a positive number (in meters).",
        messageType: "failure",
        statusCode: 400,
      });
    }

    // Step 1: Find nearby restaurants from DB
    const nearbyRestaurants = await Restaurant.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: dist,
        },
      },
    }).select("_id restaurantId");

    if (!nearbyRestaurants.length) {
      return res.status(200).json({
        message: "No nearby restaurants found.",
        messageType: "success",
        statusCode: 200,
        count: 0,
        data: [],
      });
    }

    // Step 2: Get nearby restaurantIds — prefer restaurantId if present, fallback to _id string
    const nearbyRestaurantIds = nearbyRestaurants.map(r => r.restaurantId || r._id.toString());
    console.log(nearbyRestaurantIds )
    // Step 3: Filter mock categories by nearby restaurantIds
    const filteredCategories = categories.filter(cat =>
      nearbyRestaurantIds.includes(cat.restaurantId)
    );

    // Step 4: Remove duplicate categories by name (if needed)
    const uniqueCategoriesMap = new Map();
    filteredCategories.forEach(cat => {
      if (!uniqueCategoriesMap.has(cat.categoryName)) {
        uniqueCategoriesMap.set(cat.categoryName, cat);
      }
    });

    const uniqueCategories = Array.from(uniqueCategoriesMap.values());

    // Final Response
    return res.status(200).json({
      message: "Nearby categories fetched successfully.",
      messageType: "success",
      statusCode: 200,
      count: uniqueCategories.length,
      data: uniqueCategories,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Server error while fetching nearby categories.",
      messageType: "error",
      statusCode: 500,
    });
  }
};



exports.getRecommendedRestaurants = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 5000, minOrderAmount = 0 } = req.query;

    // Validate latitude and longitude presence
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        messageType: "failure",
        message: "Latitude and longitude are required.",
        statusCode: 400,
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const dist = parseInt(maxDistance, 10);
    const minOrder = parseInt(minOrderAmount, 10);

    if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({
        messageType: "failure",
        message: "Invalid latitude or longitude values.",
        statusCode: 400,
      });
    }

    if (isNaN(dist) || dist <= 0) {
      return res.status(400).json({
        messageType: "failure",
        message: "maxDistance must be a positive number (meters).",
        statusCode: 400,
      });
    }

    const restaurants = await Restaurant.find({
      active: true,
   
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          $maxDistance: dist,
        },
      },
    })
    .sort({ rating: -1 })
    .limit(20);

    if (restaurants.length === 0) {
      return res.status(200).json({
        messageType: "failure",
        message: "No recommended restaurants found in your area.",
        count: 0,
        data: [],
      });
    }

    return res.status(200).json({
      messageType: "success",
      message: "Recommended restaurants fetched successfully.",
      count: restaurants.length,
      data: restaurants,
    });

  } catch (error) {
    console.error('Error fetching recommended restaurants:', error);
    return res.status(500).json({
      messageType: "failure",
      message: "Server error while fetching recommended restaurants.",
      statusCode: 500,
    });
  }
};