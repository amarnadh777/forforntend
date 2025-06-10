const User = require("../models/userModel");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const otpGenerator = require("../utils/otpGenerator");
const { sendEmail } = require("../utils/sendEmail");
const { sendSms } = require("../utils/sendSms");
const Favourite = require("../models/favouriteModel")
const Restaurant = require("../models/restaurantModel")

// Register user with validations, OTP generation and notifications
exports.registerUser = async (req, res) => {
  try {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const phoneRegex = /^\+91\d{10}$/;
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,}$/;

    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res
        .status(400)
        .json({
          message: "All fields are required",
          messageType: "failure",
          userId: "",
        });
    }

    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({
          message: "Invalid email format",
          messageType: "failure",
          userId: "",
        });
    }

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        message: "Invalid phone number format. Use country code (+91)",

        messageType: "failure",
        userId: "",
      });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long, include an uppercase letter, a number, and a special character.",
        messageType: "failure",
        userId: "",
      });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        message: "Email or phone number already registered",

        messageType: "failure",
        userId: "",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const phoneOtp = otpGenerator(6);
    const emailOtp = otpGenerator(6);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // await sendEmail(email, "OTP Verification", `Your OTP is ${emailOtp}`);
    // await sendSms(phone, `Hi, your OTP is ${phoneOtp}`);

    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      verification: {
        emailOtp,
        phoneOtp,
        otpExpiry,
      },
    });

    await newUser.save();

    res.status(201).json({
      message: "User registered successfully",
      messageType: "success",
      userId: newUser._id,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Server error", messageType: "failure", userId: "" ,error: error.message });
  }
};
// Verify OTPs for both email and phone
exports.verifyOtp = async (req, res) => {
  try {
    const { email, phone, emailOtp, phoneOtp } = req.body;

    if (!email || !phone || !emailOtp || !phoneOtp) {
      return res
        .status(400)
        .json({ message: "Email, phone number, and OTPs are required" });
    }

    const user = await User.findOne({ $or: [{ email }, { phone }] });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.verification.emailOtp !== emailOtp) {
      return res.status(400).json({ message: "Invalid email OTP" });
    }

    if (user.verification.phoneOtp !== phoneOtp) {
      return res.status(400).json({ message: "Invalid phone OTP" });
    }

    if (user.verification.otpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP has expired" });
    }

    user.verification.emailVerified = true;
    user.verification.phoneVerified = true;
    user.verification.emailOtp = null;
    user.verification.phoneOtp = null;
    user.verification.otpExpiry = null;

    await user.save();

    res.json({ message: "OTP verified successfully", userId: user._id });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.user._id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
        messageType: "failure"
      });
    }

    // Fetch user by ID — exclude sensitive fields like password and reset tokens
    const user = await User.findById(userId)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .lean(); // lean() returns plain JS object instead of Mongoose document

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        messageType: "failure"
      });
    }

    // Prepare addresses with proper lat-lon formatting
    const formattedAddresses = (user.addresses || []).map(addr => {
      let lat = null;
      let lon = null;

      if (addr.location && Array.isArray(addr.location.coordinates)) {
        [lon, lat] = addr.location.coordinates;
      }

      return {
        addressId: addr._id,
        type: addr.type || null,
        street: addr.street || null,
        city: addr.city || null,
        state: addr.state || null,
        zip: addr.zip || null,
        location: {
          latitude: lat,
          longitude: lon
        }
      };
    });

    // Build final response object
    const userDetails = {
      userId: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      userType: user.userType,
      profilePicture: user.profilePicture,
      walletBalance: user.walletBalance,
      loyaltyPoints: user.loyaltyPoints,
      addresses: formattedAddresses,
      deviceTokens: user.deviceTokens,
      lastActivity: user.lastActivity,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    // Send success response
    return res.status(200).json({
      success: true,
      message: "User details fetched successfully",
      messageType: "success",
      data: userDetails
    });

  } catch (error) {
    console.error("Error fetching user details:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong on the server",
      messageType: "failure"
    });
  }
};




exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",

        messageType: "failure",
        userId: "",
      });
    }

    const userExist = await User.findOne({ email });
    if (!userExist) {
      return res.status(400).json({
        message: "User not found",

        messageType: "failure",
        userId: "",
      });
    }

    const isMatch = await bcrypt.compare(password, userExist.password);
    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid credentials",

        messageType: "failure",
        userId: "",
      });
    }

    const token = jwt.sign({ userId: userExist._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Create a safe user object without password
    const user = {
      _id: userExist._id,
      name: userExist.name,
      email: userExist.email,
      role: userExist.role, // if you have roles like admin/customer etc.
    };

    res.json({
      message: "Logged in successfully",
      messageType: "success",
      token:token,
      userId: user._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", messageType: "failure" ,
             messageType: "failure",
              userId: "",
    });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const userId = req.user?._id || req.body?.userId;
    const { type, street, city, state, zip, longitude, latitude, displayName } = req.body;

    // Validate required fields
    if (!street || !city || !state || !zip || !longitude || !latitude || !userId) {
      return res.status(400).json({
        success: false,
        message: "All required fields are missing",
        messageType: "failure"
      });
    }

    // Check if user exists
    const userExist = await User.findById(userId);
    if (!userExist) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        messageType: "failure"
      });
    }

    // Initialize addresses array if it doesn't exist
    if (!userExist.addresses) {
      userExist.addresses = [];
    }

    // Create new address object
    const newAddress = {
      type, // Home/Work/Other
      street,
      city,
      state,
      zip,
      displayName:displayName, // Optional display name for the address
      location: {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
    };

    // Add the new address
    userExist.addresses.push(newAddress);
    await userExist.save();

    return res.status(200).json({
      success: true,
      message: "Address added successfully",
      messageType: "success",
      data: {
        addresses: userExist.addresses,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      messageType: "failure"
    });
  }
};
exports.deleteAddressById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { addressId } = req.params;

    // Validate essentials
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
        messageType: "failure"
      });
    }

    // Find the user
    const userExist = await User.findById(userId);
    if (!userExist) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        messageType: "failure"
      });
    }

    // Check if address exists
    const addressExists = userExist.addresses.id(addressId);
    if (!addressExists) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
        messageType: "failure"
      });
    }

    // Remove the address using pull
    userExist.addresses.pull({ _id: addressId });

    // Save the updated user
    await userExist.save();

    // Prepare updated addresses
    const updatedAddresses = (userExist.addresses || []).map(addr => {
      let lat = null;
      let lon = null;

      if (addr.location && Array.isArray(addr.location.coordinates)) {
        [lon, lat] = addr.location.coordinates;
      }

      return {
        addressId: addr._id,
        type: addr.type || null,
        street: addr.street || null,
        city: addr.city || null,
        state: addr.state || null,
        zip: addr.zip || null,
        location: {
          latitude: lat,
          longitude: lon
        }
      };
    });

    // Success response
    return res.status(200).json({
      success: true,
      message: "Address deleted successfully",
      messageType: "success",
      data: updatedAddresses
    });

  } catch (error) {
    console.error("Error deleting address:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong on the server",
      messageType: "failure"
    });
  }
};

exports.getAddress = async (req, res) => {
  try {
       const userId = req.user._id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
        messageType: "failure"
      });
    }

    const userExist = await User.findById(userId);

    if (!userExist) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        messageType: "failure"
      });
    }

    // Map addresses safely to include latitude & longitude if available
    const formattedAddresses = (userExist.addresses || []).map(address => {
      let latitude = null;
      let longitude = null;

      if (address.location && Array.isArray(address.location.coordinates)) {
        [longitude, latitude] = address.location.coordinates;
      }

      return {
        addressId: address._id,
        type: address.type || null,
        street: address.street || null,
        city: address.city || null,
        state: address.state || null,
        zip: address.zip || null,
        displayName:address.displayName || null,
        location: {
          latitude,
          longitude
        }
      };
    });

    return res.status(200).json({
      success: true,
      message: "Addresses fetched successfully",
      messageType: "success",
      Addresses: formattedAddresses
    });

  } catch (error) {
    console.error("Error fetching addresses:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong on the server",
      messageType: "failure"
    });
  }
};

exports.updateAddressById = async (req, res) => {
  try {
   const userId = req.user._id;
   const {addressId} = req.params
    const { street, city, state, zip, longitude, latitude } = req.body;

    // Validate essentials
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
        messageType: "failure"
      });
    }

    // Find the user
    const userExist = await User.findById(userId);
    if (!userExist) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        messageType: "failure"
      });
    }

    // Find the address
    const address = userExist.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
        messageType: "failure"
      });
    }

    // Update only provided fields
    if (street !== undefined) address.street = street;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (zip !== undefined) address.zip = zip;

    if (longitude !== undefined && latitude !== undefined) {
      address.location = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      };
    }

    // Save updated user document
    await userExist.save();

    // Format updated addresses
    const updatedAddresses = (userExist.addresses || []).map(addr => {
      let lat = null;
      let lon = null;

      if (addr.location && Array.isArray(addr.location.coordinates)) {
        [lon, lat] = addr.location.coordinates;
      }

      return {
        addressId: addr._id,
        type: addr.type || null,
        street: addr.street || null,
        city: addr.city || null,
        state: addr.state || null,
        zip: addr.zip || null,
        location: {
          latitude: lat,
          longitude: lon
        }
      };
    });

    // Success response
    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      messageType: "success",
      data: updatedAddresses
    });

  } catch (error) {
    console.error("Error updating address:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong on the server",
      messageType: "failure"
    });
  }
};

// Resend new OTPs
exports.resendOtp = async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res
        .status(400)
        .json({ message: "Email or phone number is required" });
    }

    const user = await User.findOne({ $or: [{ email }, { phone }] });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentTime = new Date();
    const timeDifference = (currentTime - user.verification.otpExpiry) / 60000;

    if (timeDifference < 5) {
      return res
        .status(400)
        .json({ message: "You can only request a new OTP after 5 minutes" });
    }

    const emailOtp = otpGenerator(6);
    const phoneOtp = otpGenerator(6);
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.verification.emailOtp = emailOtp;
    user.verification.phoneOtp = phoneOtp;
    user.verification.otpExpiry = otpExpiry;

    await user.save();

    await sendEmail(
      user.email,
      "OTP Verification",
      `Your new email OTP is ${emailOtp}`
    );
    await sendSms(user.phone, `Your new phone OTP is ${phoneOtp}`);

    res.json({ message: "OTP sent successfully to email and phone" });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};



exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email is provided
    if (!email) {
      return res.status(400).json({
        message: "Email is required.",
        messageType: "failure",
      });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "No user with that email.",
        messageType: "failure",
      });
    }
 
 const otp = Math.floor(10000 + Math.random() * 90000).toString();
 

    // Set OTP, expiry (5 mins), and reset otpVerified flag
    user.resetPasswordToken = otp;
    user.resetPasswordExpires = Date.now() + 5 * 60 * 1000;
    user.forgotPasswordOtpVerified = false; // reset it when sending a new otp

    await user.save();

    // Send email with OTP
    const emailResult = await sendEmail(
      user.email,
      "Your Password Reset OTP",
      `Your OTP for password reset is: ${otp}. It will expire in 5 minutes.`
    );

    console.log("Email sent:", emailResult);

    if (!emailResult.accepted || !emailResult.accepted.length) {
      return res.status(500).json({
        message: "Failed to deliver OTP email.",
        messageType: "failure",
      });
    }

    // Success Response
    res.status(200).json({
      message: "OTP sent to your email.",
      messageType: "success",
      userId: user._id,
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      message: "Server error.",
      messageType: "failure",
    });
  }
};

exports.verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Validate required fields
    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP are required.",
        messageType: "failure",
      });
    }

    // Find user by email
    const user = await User.findOne({
      email,
      resetPasswordToken: otp,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired OTP.",
        messageType: "failure",
      });
    }

    // Mark OTP as verified
    user.forgotPasswordOtpVerified = true;
    await user.save();

    res.status(200).json({
      message: "OTP verified successfully.",
      messageType: "success",
      userId: user._id,
    });

  } catch (error) {
    console.error("Verify forgot password OTP error:", error);
    res.status(500).json({
      message: "Server error.",
      messageType: "failure",
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { newPassword, email } = req.body;

    if (!newPassword || !email) {
      return res.status(400).json({
        message: "Email and new password are required.",
        messageType: "failure",
      });
    }

    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters long, include an uppercase letter, a number, and a special character.",
        messageType: "failure",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
        messageType: "failure",
      });
    }

    // Check if OTP was verified before resetting password
    if (!user.forgotPasswordOtpVerified) {
      return res.status(400).json({
        message: "OTP verification required before resetting password.",
        messageType: "failure",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear OTP fields after password reset
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.forgotPasswordOtpVerified = false;

    await user.save();

    res.status(200).json({
      message: "Password reset successful.",
      messageType: "success",
    });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      message: "Server error.",
      messageType: "failure",
    });
  }
};


exports.sendLoginOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        message: "Phone number is required",
        messageType: "failure",
      });
    }

    // Check if user exists
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        message: "Phone number not registered",
        messageType: "failure",
      });
    }

    // Generate 5-digit OTP
    const otp = Math.floor(10000 + Math.random() * 90000).toString();

    // Set expiry 5 mins from now
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    // Save OTP and expiry as loginOtp
    user.loginOtp = otp;
    user.loginOtpExpiresAt = expiry;
    await user.save();

    // Try to send SMS
    try {
      await sendSms(phone, `Your OTP is ${otp}`);
      // SMS sent successfully
      return res.status(200).json({
        message: "OTP sent successfully",
        messageType: "success",
      });
    } catch (smsError) {
      console.error("SMS sending failed:", smsError);
      // Fallback: OTP not sent by SMS but still return success with warning
      return res.status(200).json({
        message:
          "OTP generated successfully but failed to send SMS. Please try again or contact support.",
        messageType: "failure",
      });
    }
  } catch (error) {
    console.error("Error in sendLoginOtp:", error);
    res.status(500).json({
      message: "Server Error",
      messageType: "failure",
    });
  }
};



exports.verifyLoginOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        message: "Phone number and OTP are required",
        messageType: "failure",
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
        messageType: "failure",
      });
    }

    if (
      user.loginOtp !== otp ||
      !user.loginOtpExpiresAt ||
      user.loginOtpExpiresAt < new Date()
    ) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
        messageType: "failure",
      });
    }

    // Clear OTP fields after successful verification
    user.loginOtp = null;
    user.loginOtpExpiresAt = null;
    await user.save();

    // Generate JWT token
    const payload = {
      userId: user._id,
      phone: user.phone,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d", // token valid for 7 days, change as needed
    });



    return res.status(200).json({
      message: "Logged in successfull with phone number",
      messageType: "success",
      token:token, // send token to client
      userId: user._id,
    });
  } catch (error) {
    console.error("Error in verifyLoginOtp:", error);
    return res.status(500).json({
      message: "Server error",
      messageType: "failure",
    });
  }
};





exports.addFavouriteRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.body;
    const userId = req.user._id; // Assuming JWT middleware sets req.user

    if (!restaurantId) {
      return res.status(400).json({ message: 'restaurantId is required', messageType: "failure" });
    }

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: 'Restaurant not found', messageType: "failure" });
    }

    // Check if already added to favourites
    const alreadyFavourite = await Favourite.findOne({ user: userId, item: restaurantId, itemType: 'Restaurant' });
    if (alreadyFavourite) {
      return res.status(400).json({ message: 'Restaurant already in favourites', messageType: "failure" });
    }

    // Add to favourites
    const newFavourite = new Favourite({
      user: userId,
      item: restaurantId,
      itemType: 'Restaurant'  // IMPORTANT: set this to 'Restaurant'
    });

    await newFavourite.save();

    res.status(201).json({ message: 'Added to favourites successfully', messageType: "success", data: newFavourite });

  } catch (error) {
    console.error('Error adding favourite:', error);
    res.status(500).json({ message: 'Internal Server Error', messageType: "failure" });
  }
};



exports.removeFavouriteRestaurant = async (req, res) => {
  try {
    const { restaurantId } = req.body;
    const userId = req.user._id; // Assuming JWT middleware sets req.user

    if (!restaurantId) {
      return res.status(400).json({ message: 'restaurantId is required', messageType: "failure" });
    }

    // Find and delete the favourite entry
    const deleted = await Favourite.findOneAndDelete({
      user: userId,
      item: restaurantId,
      itemType: 'Restaurant'
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Favourite restaurant not found', messageType: "failure" });
    }

    res.status(200).json({ message: 'Removed from favourites successfully', messageType: "success" });

  } catch (error) {
    console.error('Error removing favourite:', error);
    res.status(500).json({ message: 'Internal Server Error', messageType: "failure" });
  }
};


exports.getFavouriteRestaurants = async (req, res) => {
  try {
    const userId = req.user._id; // Assuming JWT middleware sets req.user

    // Find favourites for user where itemType is 'Restaurant' and populate restaurant details
    const favourites = await Favourite.find({ user: userId, itemType: 'Restaurant' })
      .populate('item', 'name location cuisine rating images') // select restaurant fields you want
      .exec();

    // Map to return only the restaurant data inside favourites
    const favouriteRestaurants = favourites.map(fav => fav.item);

    res.status(200).json({ 
      message: 'Favourite restaurants fetched successfully',
      messageType: "success",
      data: favouriteRestaurants 
    });

  } catch (error) {
    console.error('Error fetching favourites:', error);
    res.status(500).json({ message: 'Internal Server Error', messageType: "failure" });
  }
};



