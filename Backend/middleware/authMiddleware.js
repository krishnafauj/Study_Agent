import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {

  try {

    // get Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "No token provided"
      });
    }

    // format: Bearer TOKEN
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Invalid token format"
      });
    }

    // verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // attach user info to request
    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
};
