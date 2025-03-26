import React from "react";

import bgImage from "../../assets/pgocbg.png";

const NotFoundPage = () => {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        className="bg-white rounded-lg shadow-lg p-8 w-96"
        style={{
          backgroundColor: "rgba(199, 199, 199, 0.9)", // White with slight transparency
        }}
      >
        {/* Not Found Text */}
        <div className="text-center mb-4">
          <h2 className="text-3xl font-semibold text-gray-900">404</h2>
          <p className="text-xl text-gray-700">Page Not Found</p>
        </div>

        <div className="text-center">
          <p className="text-sm text-gray-600">
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
