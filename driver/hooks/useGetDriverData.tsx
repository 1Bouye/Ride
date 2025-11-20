import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useEffect, useState, useCallback } from "react";

export const useGetDriverData = () => {
  const [driver, setDriver] = useState<DriverType>();
  const [loading, setLoading] = useState(true);

  const fetchDriverData = useCallback(async () => {
    try {
      const accessToken = await AsyncStorage.getItem("accessToken");
      const res = await axios.get(
        `${process.env.EXPO_PUBLIC_SERVER_URI}/driver/me`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      setDriver(res.data.driver);
      setLoading(false);
      return res.data.driver;
    } catch (error) {
      console.log(error);
      setLoading(false);
      throw error;
    }
  }, []);

  useEffect(() => {
    fetchDriverData();
  }, [fetchDriverData]);

  return { loading, driver, refreshDriverData: fetchDriverData };
};
