import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  Box,
  Grid,
  Typography,
} from "@mui/material";
import { AddCircleOutline, RemoveCircleOutline } from "@mui/icons-material";
import CustomButton from "../../components/buttons";
import notify from "../../components/toast";
import { getUserData } from "../../../services/user_data";

const generateHourOptions = () =>
  Array.from({ length: 25 }, (_, i) => i.toString().padStart(2, "0"));
const generateMinuteOptions = () =>
  Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

const apiUrl = import.meta.env.VITE_API_URL;
const MAX_SCHEDULES = 20;

const inputStyles = {
  "& .MuiOutlinedInput-root": {
    fontSize: "12px",
  },
};

const selectStyles = {
  "& .MuiOutlinedInput-root": {
    fontSize: "12px",
  },
};

const labelStyles = {
  fontSize: "12px",
  backgroundColor: "white",
  px: 0.5,
};

const menuProps = {
  PaperProps: {
    style: {
      maxHeight: 200,
    },
  },
};

const AddScheduleDataDialog = ({
  open,
  handleClose,
  adAccountId,
  accessToken,
  setSelectedAccount,
}) => {
  const [scheduleData, setScheduleData] = useState([
    {
      hour: "",
      minute: "",
      campaign_type: "",
      what_to_watch: "",
      cpp_metric: "",
      on_off: "",
    },
  ]);

  const lastScheduleRefs = useRef([]);

  useEffect(() => {
    if (lastScheduleRefs.current.length > 0) {
      const lastRef = lastScheduleRefs.current[scheduleData.length - 1];
      if (lastRef) {
        lastRef.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [scheduleData]);

  const handleAddSchedule = () => {
    if (scheduleData.length < MAX_SCHEDULES) {
      setScheduleData((prev) => [
        ...prev,
        {
          hour: "",
          minute: "",
          campaign_type: "",
          what_to_watch: "",
          cpp_metric: "",
          on_off: "",
        },
      ]);
    } else notify(`Maximum of ${MAX_SCHEDULES} only`, "error");
  };
  const handleRemoveSchedule = (index) => {
    if (scheduleData.length > 1) {
      setScheduleData(scheduleData.filter((_, i) => i !== index));
    }
  };

  const handleScheduleChange = (index, field, value) => {
    const updatedSchedules = [...scheduleData];
    updatedSchedules[index][field] = value;
    setScheduleData(updatedSchedules);
  };

  const handleSubmit = async () => {
    if (!adAccountId || !accessToken) {
      notify("Ad Account ID and Access Token are required!", "error");
      return;
    }

    const { id } = getUserData();
    const formattedSchedules = scheduleData.map((schedule) => ({
      time: `${schedule.hour}:${schedule.minute}`,
      campaign_type: schedule.campaign_type,
      what_to_watch: schedule.what_to_watch,
      watch: schedule.what_to_watch,
      cpp_metric: schedule.cpp_metric,
      on_off: schedule.on_off,
    }));

    const payload = {
      ad_account_id: adAccountId,
      id: id, // Replace this with actual user ID
      access_token: accessToken,
      schedule_data: formattedSchedules,
    };

    try {
      const response = await fetch(`${apiUrl}/api/v1/schedule/add-schedule`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create schedule: ${errorText}`);
      }

      notify("Schedule created successfully!", "success");

      setSelectedAccount((prev) => {
        if (!prev) return prev; // Prevents null reference error

        const updatedScheduleData = { ...(prev.schedule_data || {}) }; // Ensure it's an object

        formattedSchedules.forEach((schedule) => {
          const key = `${schedule.time}-${schedule.campaign_type}`;
          updatedScheduleData[key] = schedule;
        });

        return { ...prev, schedule_data: updatedScheduleData };
      });

      handleClose(); // Close dialog after success
    } catch (error) {
      console.error("Error creating schedule:", error);
      notify(error.message, "error");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle className="bg-red-600 text-white text-center font-bold">
        New Schedule ON/OFF
      </DialogTitle>
      <DialogContent
        dividers
        className="max-h-[500px] overflow-y-auto bg-gray-100 p-4"
      >
        {/* Schedule Section */}
        {scheduleData.map((schedule, index) => (
          <Box
            key={index}
            ref={(el) => (lastScheduleRefs.current[index] = el)}
            className="border border-gray-300 bg-white p-4 rounded-lg mt-4 shadow-md"
          >
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography
                variant="subtitle1"
                className="text-gray-700 font-semibold"
              >
                New Time to add {index + 1}
              </Typography>

              {scheduleData.length > 1 && (
                <IconButton
                  onClick={() => handleRemoveSchedule(index)}
                  color="error"
                >
                  <RemoveCircleOutline fontSize="medium" />
                </IconButton>
              )}
            </Box>

            <Grid container spacing={2} className="mt-2">
              <Grid item xs={6}>
                <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                  <InputLabel shrink sx={labelStyles}>
                    Hour (00-24)
                  </InputLabel>
                  <Select
                    value={schedule.hour}
                    onChange={(e) =>
                      handleScheduleChange(index, "hour", e.target.value)
                    }
                    sx={selectStyles}
                    MenuProps={menuProps}
                  >
                    {generateHourOptions().map((hour) => (
                      <MenuItem
                        key={hour}
                        value={hour}
                        sx={{ fontSize: "12px" }}
                      >
                        {hour}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                  <InputLabel shrink sx={labelStyles}>
                    Minute (00-59)
                  </InputLabel>
                  <Select
                    value={schedule.minute}
                    onChange={(e) =>
                      handleScheduleChange(index, "minute", e.target.value)
                    }
                    sx={selectStyles}
                    MenuProps={menuProps}
                  >
                    {generateMinuteOptions().map((minute) => (
                      <MenuItem
                        key={minute}
                        value={minute}
                        sx={{ fontSize: "12px" }}
                      >
                        {minute}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <FormControl fullWidth size="small" sx={{ mt: 2 }}>
              <InputLabel shrink sx={labelStyles}>
                Campaign Type
              </InputLabel>
              <Select
                value={schedule.campaign_type}
                onChange={(e) =>
                  handleScheduleChange(index, "campaign_type", e.target.value)
                }
                sx={selectStyles}
                MenuProps={menuProps}
              >
                <MenuItem value="TEST">TEST (so1) </MenuItem>
                <MenuItem value="REGULAR">REGULAR (so2) </MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" sx={{ mt: 2 }}>
              <InputLabel shrink sx={labelStyles}>
                Watch
              </InputLabel>
              <Select
                value={schedule.what_to_watch}
                onChange={(e) =>
                  handleScheduleChange(index, "what_to_watch", e.target.value)
                }
                sx={selectStyles}
                MenuProps={menuProps}
              >
                <MenuItem value="Campaigns">Campaigns</MenuItem>
                <MenuItem value="AdSets">AdSets</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="CPP Metric (0-10,000)"
              fullWidth
              variant="outlined"
              value={schedule.cpp_metric}
              onChange={(e) => {
                const value = e.target.value;
                if (
                  /^\d{0,4}(\.\d{0,2})?$|^10000(\.00?)?$/.test(value) ||
                  value === ""
                ) {
                  handleScheduleChange(index, "cpp_metric", value);
                }
              }}
              sx={{ ...inputStyles, mt: 2 }}
              size="small"
              InputLabelProps={{
                shrink: true, // Prevents label from overlapping the border
                sx: { fontSize: "12px" }, // Reduces label font size
              }}
            />

            <FormControl fullWidth size="small" sx={{ mt: 2 }}>
              <InputLabel shrink sx={labelStyles}>
                ON/OFF
              </InputLabel>
              <Select
                value={schedule.on_off}
                onChange={(e) =>
                  handleScheduleChange(index, "on_off", e.target.value)
                }
                sx={selectStyles}
                MenuProps={menuProps}
              >
                <MenuItem value="ON">ON</MenuItem>
                <MenuItem value="OFF">OFF</MenuItem>
              </Select>
            </FormControl>
          </Box>
        ))}
        <Box className="flex justify-center gap-2 mt-3">
          <IconButton onClick={handleAddSchedule} color="primary">
            <AddCircleOutline fontSize="medium" />
          </IconButton>
        </Box>
      </DialogContent>
      <DialogActions>
        <CustomButton name="Cancel" onClick={handleClose} type="secondary" />
        <CustomButton name="Submit" onClick={handleSubmit} type="primary" />
      </DialogActions>
    </Dialog>
  );
};

export default AddScheduleDataDialog;
