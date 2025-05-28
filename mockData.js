const categories = [
  {
    categoryId: 1,
    categoryName: "Fruits",
    restaurantId: "rest_101",
    categoryimagerelation: {
      imageName: "https://example.com/fruits.jpg"
    },
    categoryrelation1: [  
      {
        subCategoryId: 101,
        subcategoryName: "Apples",
        restaurantId: "rest_101",
        subcategoryImagerelation: {
          imageName: "https://example.com/apples.jpg"
        }
      },
      {
        subCategoryId: 102,
        subcategoryName: "Bananas",
        restaurantId: "rest_101",
        subcategoryImagerelation: {
          imageName: "https://example.com/bananas.jpg"
        }
      }
    ]
  },
  {
    categoryId: 2,
    categoryName: "Vegetables",
    restaurantId: "rest_101",
    categoryimagerelation: {
      imageName: "https://example.com/vegetables.jpg"
    },
    categoryrelation1: [
      {
        subCategoryId: 201,
        subcategoryName: "Tomatoes",
        restaurantId: "rest_101",
        subcategoryImagerelation: {
          imageName: "https://example.com/tomatoes.jpg"
        }
      },
      {
        subCategoryId: 202,
        subcategoryName: "Spinach",
        restaurantId: "rest_101",
        subcategoryImagerelation: {
          imageName: "https://example.com/spinach.jpg"
        }
      }
    ]
  },
  // Categories for restaurant rest_102
  {
    categoryId: 3,
    categoryName: "Dairy",
    restaurantId: "rest_102",
    categoryimagerelation: {
      imageName: "https://example.com/dairy.jpg"
    },
    categoryrelation1: [
      {
        subCategoryId: 301,
        subcategoryName: "Milk",
        restaurantId: "rest_102",
        subcategoryImagerelation: {
          imageName: "https://example.com/milk.jpg"
        }
      },
      {
        subCategoryId: 302,
        subcategoryName: "Cheese",
        restaurantId: "rest_102",
        subcategoryImagerelation: {
          imageName: "https://example.com/cheese.jpg"
        }
      }
    ]
  },
  {
    categoryId: 4,
    categoryName: "Bakery",
    restaurantId: "rest_102",
    categoryimagerelation: {
      imageName: "https://example.com/bakery.jpg"
    },
    categoryrelation1: [
      {
        subCategoryId: 401,
        subcategoryName: "Bread",
        restaurantId: "rest_102",
        subcategoryImagerelation: {
          imageName: "https://example.com/bread.jpg"
        }
      },
      {
        subCategoryId: 402,
        subcategoryName: "Cakes",
        restaurantId: "rest_102",
        subcategoryImagerelation: {
          imageName: "https://example.com/cakes.jpg"
        }
      }
    ]
  }
];


const restaurants = [
  {
    restaurantId: "rest_101",
    name: "Fresh Farm Store",
    location: {
      type: "Point",
      coordinates: [78.4867, 17.3850], 
    },
    address: "Hyderabad, Telangana, India",
  },
  {
    restaurantId: "rest_102",
    name: "Green Veggies",
    location: {
      type: "Point",
      coordinates: [72.8777, 19.0760],
    },
    address: "Mumbai, Maharashtra, India",
  },
];
module.exports = { categories, restaurants };