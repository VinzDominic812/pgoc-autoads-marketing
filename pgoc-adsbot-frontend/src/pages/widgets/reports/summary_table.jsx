// summary_table.jsx
import React from "react";
import { Box, Typography } from "@mui/material";

const SummaryTable = ({ data }) => (
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

export default SummaryTable;
