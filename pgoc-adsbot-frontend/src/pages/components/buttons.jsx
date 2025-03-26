import React from "react";
import { Button } from "@mui/material";

/**
 * Reusable Custom Button with consistent styling
 * @param {string} name - Button text
 * @param {function} onClick - Click event handler
 * @param {JSX.Element|null} icon - Optional start icon
 * @param {string} type - "primary" | "secondary" | "tertiary"
 * @param {string} color - Custom color (only for tertiary)
 * @param {string} width - Custom width (default: "auto")
 * @param {string} height - Custom height (default: "40px")
 */
const CustomButton = ({
  name,
  onClick,
  icon = null,
  type = "primary",
  color,
  width = "auto",
  height = "40px",
  ...props
}) => {
  let buttonStyles = {
    width: width,
    height: height,
    minWidth: "120px", // Ensures buttons don’t shrink too much
    fontSize: "14px",
    fontWeight: "500",
    borderRadius: "8px",
    textTransform: "none",
    padding: "10px 16px", // More padding for spacing
    transition: "all 0.2s ease-in-out",
    boxShadow: "0px 2px 6px rgba(0, 0, 0, 0.08)",
    whiteSpace: "nowrap", // Prevents text from wrapping
    overflow: "hidden",
    textOverflow: "ellipsis", // Ensures text does not overflow
  };

  switch (type) {
    case "primary":
      buttonStyles = {
        ...buttonStyles,
        backgroundColor: "#D32F2F",
        color: "#FFFFFF",
        "&:hover": {
          backgroundColor: "#B71C1C",
          transform: "scale(1.03)", // Slightly subtle hover effect
        },
      };
      break;
    case "secondary":
      buttonStyles = {
        ...buttonStyles,
        border: "1.5px solid #B0BEC5",
        color: "#455A64",
        backgroundColor: "transparent",
        "&:hover": {
          backgroundColor: "#ECEFF1",
          transform: "scale(1.03)",
        },
      };
      break;
    case "tertiary":
      buttonStyles = {
        ...buttonStyles,
        backgroundColor: color || "#4CAF50",
        color: "#FFFFFF",
        "&:hover": {
          backgroundColor: "#388E3C",
          transform: "scale(1.03)",
        },
      };
      break;
    
    default:
      break;
  }

  return (
    <Button
      variant={type === "secondary" ? "outlined" : "contained"}
      onClick={onClick}
      startIcon={icon}
      sx={buttonStyles}
      {...props}
    >
      {name}
    </Button>
  );
};

export default CustomButton;
