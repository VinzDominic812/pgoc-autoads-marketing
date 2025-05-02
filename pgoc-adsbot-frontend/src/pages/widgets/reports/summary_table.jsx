import React from "react";
import { Box, Typography } from "@mui/material";

const SummaryTable = ({ data }) => {
  // Ensure data is an array and not empty
  if (!Array.isArray(data) || data.length === 0) {
    return <Typography>No summary data available</Typography>;
  }

  return (
    <Box sx={{ width: "100%" }}>
      {data.map((item, idx) => (
        <Box
          key={idx}
          sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
        >
          <Typography fontWeight="bold">{item.label}</Typography>
          <Typography>{item.value}</Typography>
        </Box>
      ))}
    </Box>
  );
};

export default SummaryTable;