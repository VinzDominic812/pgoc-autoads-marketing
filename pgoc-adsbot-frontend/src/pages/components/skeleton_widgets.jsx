import React from "react";
import { Card, CardContent, Skeleton } from "@mui/material";

const LoadingWidgetCard = ({ height, count = 20}) => {
  return (
    <Card
      elevation={3}
      sx={{
        width: "100%",
        height: height || "650px",
        backgroundColor: "#FFFFFF",
        borderRadius: "12px",
        boxShadow: "0px 6px 12px rgba(0, 0, 0, 0.1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: "12px",
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Skeleton variant="text" width="60%" height={30} />
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton
            key={index}
            variant="rectangular"
            width="100%"
            height={20}
            sx={{ my: 1 }}
          />
        ))}
      </CardContent>
    </Card>
  );
};

export default LoadingWidgetCard;
