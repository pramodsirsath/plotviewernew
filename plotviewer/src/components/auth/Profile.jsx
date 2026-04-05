import React, { useEffect, useState } from "react";
import API from "../../services/api";

const Profile = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await API.get("/auth/profile");
        setUser(res.data);
      } catch (err) {
        alert("Unauthorized - Please login");
      }
    };

    fetchProfile();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h2>Profile</h2>

      {user ? (
        <pre>{JSON.stringify(user, null, 2)}</pre>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
};

export default Profile;