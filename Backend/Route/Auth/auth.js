import express from "express";
import jwt from "jsonwebtoken";
import User from "../../models/user.js";
import { OAuth2Client } from "google-auth-library";

const router = express.Router();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post("/", async (req, res) => {
  try {

    const token = req.body?.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token missing"
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google payload"
      });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const profilePicture = payload.picture;

    let user = await User.findOne({ googleId });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;

      user = await User.create({
        googleId,
        email,
        name,
        profilePicture
      });
    }

    const jwtToken = jwt.sign(
      {
        userId: user._id,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: isNewUser
        ? "New user registered successfully"
        : "Login successful",
      isNewUser,
      token: jwtToken,
      user
    });

  } catch (error) {

    console.error("Auth error:", error);

    res.status(401).json({
      success: false,
      message: "Google authentication failed"
    });

  }
});

export default router;