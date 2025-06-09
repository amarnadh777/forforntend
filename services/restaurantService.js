const mongoose = require('mongoose');
const Restaurant = require('../models/restaurantModel');
const moment = require('moment');

const restaurantService = {
  /**
   * Check restaurant status and opening hours
   * @param {String} restaurantId - ID of the restaurant
   * @returns {Promise<Object>} { isAvailable: Boolean, nonAvailabilityReason: String|null, nextOpeningTime: String|null }
   */
  checkStatus: async (restaurantId) => {
    try {
      // Fetch the restaurant document
      const restaurant = await Restaurant.findById(restaurantId).lean();
      
      // Check if restaurant exists
      if (!restaurant) {
        return { 
          isAvailable: false,
          nonAvailabilityReason: "Restaurant not found",
          nextOpeningTime: null
        };
      }

      // Check basic statuses
      if (!restaurant.active) {
        return { 
          isAvailable: false,
          nonAvailabilityReason: "Restaurant is inactive",
          nextOpeningTime: null
        };
      }

      if (restaurant.autoOnOff === false) {
        return { 
          isAvailable: false,
          nonAvailabilityReason: "Restaurant is temporarily closed",
          nextOpeningTime: null
        };
      }

      // Check opening hours - handle both array and object formats
      const now = moment();
      const currentDay = now.format('dddd').toLowerCase();
      
      let todayHours;
      if (Array.isArray(restaurant.openingHours)) {
        // Handle array format
        todayHours = restaurant.openingHours.find(
          oh => oh.day.toLowerCase() === currentDay
        );
      } else {
        // Handle object format
        todayHours = restaurant.openingHours[currentDay];
      }

      if (!todayHours || todayHours.isClosed) {
        const nextOpeningTime = await restaurantService.getNextOpeningTime(restaurantId);
        return {
          isAvailable: false,
          nonAvailabilityReason: "Restaurant is closed today",
          nextOpeningTime
        };
      }

      const currentTime = now.format('HH:mm');
      if (currentTime < todayHours.openingTime || currentTime > todayHours.closingTime) {
        const nextOpeningTime = await restaurantService.getNextOpeningTime(restaurantId);
        return {
          isAvailable: false,
          nonAvailabilityReason: "Outside of business hours",
          nextOpeningTime
        };
      }

      return {
        isAvailable: true,
        nonAvailabilityReason: null,
        nextOpeningTime: null
      };

    } catch (error) {
      console.error('Error in checkStatus:', error);
      return {
        isAvailable: false,
        nonAvailabilityReason: "Error checking restaurant status",
        nextOpeningTime: null
      };
    }
  },

  /**
   * Get next opening time description
   * @param {String} restaurantId - ID of the restaurant
   * @returns {Promise<String>} - Human-readable opening time description
   */
  getNextOpeningTime: async (restaurantId) => {
    try {
      const restaurant = await Restaurant.findById(restaurantId).lean();
      if (!restaurant) {
        return "Restaurant not found";
      }

      const now = moment();
      const daysOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      let currentDayIndex = daysOrder.indexOf(now.format('dddd').toLowerCase());
      
      // Handle both array and object formats for opening hours
      let openingHoursArray;
      if (Array.isArray(restaurant.openingHours)) {
        openingHoursArray = [...restaurant.openingHours];
      } else {
        // Convert object to array
        openingHoursArray = Object.entries(restaurant.openingHours).map(([day, hours]) => ({
          day,
          ...hours
        }));
      }

      // Sort opening hours by day order
      const sortedOpeningHours = openingHoursArray.sort((a, b) => {
        return daysOrder.indexOf(a.day) - daysOrder.indexOf(b.day);
      });

      // Check next 7 days starting from today
      for (let i = 0; i < 7; i++) {
        const dayIndex = (currentDayIndex + i) % 7;
        const dayName = daysOrder[dayIndex];
        
        const dayHours = sortedOpeningHours.find(oh => oh.day.toLowerCase() === dayName);
        
        if (dayHours && !dayHours.isClosed) {
          const nextOpenDate = moment().add(i, 'days')
                             .set({
                               hour: dayHours.openingTime.split(':')[0],
                               minute: dayHours.openingTime.split(':')[1],
                               second: 0
                             });
          
          // If it's today but already past opening time, skip to next day
          if (i === 0 && now.isAfter(nextOpenDate)) {
            continue;
          }
          
          return `Opens ${i === 0 ? 'today' : i === 1 ? 'tomorrow' : `on ${dayName}`} at ${dayHours.openingTime}`;
        }
      }
      
      return "No upcoming opening times found";
    } catch (error) {
      console.error('Error in getNextOpeningTime:', error);
      return "Error determining next opening time";
    }
  }
};

module.exports = restaurantService;