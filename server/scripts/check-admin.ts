require("dotenv").config();
import prisma from "../utils/prisma";

const checkAdmin = async () => {
  try {
    console.log("🔍 Checking for admin users in database...\n");
    console.log("📡 Database URL:", process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***:***@") || "Not set");
    console.log("");

    // Find all admin users
    const admins = await prisma.admin.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        // Don't show password for security
      },
    });

    if (admins.length === 0) {
      console.log("❌ No admin users found in the database.");
    } else {
      console.log(`✅ Found ${admins.length} admin user(s):\n`);
      admins.forEach((admin, index) => {
        console.log(`Admin #${index + 1}:`);
        console.log(`  🆔 ID: ${admin.id}`);
        console.log(`  📧 Email: ${admin.email}`);
        console.log(`  👤 Name: ${admin.name || "Not set"}`);
        console.log(`  📅 Created: ${admin.createdAt.toLocaleString()}`);
        console.log(`  🔄 Updated: ${admin.updatedAt.toLocaleString()}`);
        console.log("");
      });
    }

    // Also check if we can find the specific admin
    const specificAdmin = await prisma.admin.findUnique({
      where: { email: "admin@ridewave.test" },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (specificAdmin) {
      console.log("✅ Verified: admin@ridewave.test exists in database!");
      console.log(`   ID: ${specificAdmin.id}`);
    } else {
      console.log("❌ admin@ridewave.test not found in database.");
    }
  } catch (error: any) {
    console.error("❌ Error checking admin users:", error.message);
    if (error.code === "P2010") {
      console.error("\n💡 Database connection error. Check your DATABASE_URL in .env file.");
    }
  } finally {
    await prisma.$disconnect();
  }
};

checkAdmin();

