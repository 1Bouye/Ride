require("dotenv").config();
import bcrypt from "bcryptjs";
import prisma from "../utils/prisma";

const createAdmin = async () => {
  try {
    // Use credentials from .env if available, otherwise use defaults
    const email = process.env.ADMIN_EMAIL || process.env.FLASHRIDE_ADMIN_EMAIL || "admin@ridewave.test";
    const password = process.env.ADMIN_PASSWORD || process.env.FLASHRIDE_ADMIN_PASSWORD || "admin123";
    const name = "Admin User";

    // Check if admin already exists
    const existingAdmin = await prisma.admin.findUnique({
      where: { email },
    });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    let admin;
    if (existingAdmin) {
      // Update existing admin with new password
      console.log("🔄 Admin user already exists. Updating password...");
      admin = await prisma.admin.update({
        where: { email },
        data: {
          password: hashedPassword,
          name: name || existingAdmin.name,
        },
      });
      console.log("✅ Admin password updated successfully!");
    } else {
      // Create new admin user
      admin = await prisma.admin.create({
        data: {
          email,
          password: hashedPassword,
          name,
        },
      });
      console.log("✅ Admin user created successfully!");
    }

    console.log("📧 Email:", email);
    console.log("🔑 Password:", password);
    console.log("🆔 Admin ID:", admin.id);
    console.log("\n⚠️  Please change the password after first login for security.");
  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
};

createAdmin();

