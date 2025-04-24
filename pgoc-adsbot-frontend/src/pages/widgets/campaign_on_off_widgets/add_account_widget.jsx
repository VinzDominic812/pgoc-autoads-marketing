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
  CircularProgress,
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

// Reduce dropdown size & font
const menuProps = {
  PaperProps: {
    style: {
      maxHeight: 200,
    },
  },
};

const AddAdAccountWidget = ({ open, handleClose, fetchSchedules }) => {
  const [campaignTypes, setCampaignTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [scheduleData, setScheduleData] = useState([
    {
      hour: "",
      minute: "",
      campaign_code: "",
      watch: "",
      cpp_metric: "",
      on_off: "",
    },
  ]);

  const { id: uid } = getUserData();

  useEffect(() => {
    const fetchCampaignTypes = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${apiUrl}/api/v1/user/${uid}/campaign-codes`
        ); // Fetch campaign codes from your backend
        const data = await response.json();
        setCampaignTypes(Array.isArray(data?.data) ? data.data : []); // Set the 'data' array from the response to state
      } catch (error) {
        console.error("Error fetching campaign types:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCampaignTypes();
  }, [uid]);

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
          campaign_code: "",
          watch: "",
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

    const formattedSchedules = scheduleData.map((schedule) => ({
      time: `${schedule.hour}:${schedule.minute}`,
      campaign_code: schedule.campaign_code,
      watch: schedule.watch,
      cpp_metric: schedule.cpp_metric,
      on_off: schedule.on_off,
    }));

    const { id } = getUserData();

    const payload = {
      ad_account_id: adAccountId,
      user_id: id, // You should replace this with the actual user ID
      access_token: accessToken,
      schedule_data: formattedSchedules,
    };

    try {
      const response = await fetch(
        `${apiUrl}/api/v1/schedule/create-campaign-schedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            skip_zrok_interstitial: "true",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create schedule: ${errorText}`);
      }

      notify("Schedule created successfully!", "success");
      handleClose();
      fetchSchedules();
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
        {/* Ad Account Section */}
        <Box className="space-y-4 p-3 bg-white rounded-lg shadow-md">
          <TextField
            label="Ad Account ID"
            fullWidth
            variant="outlined"
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            sx={{ ...inputStyles, mt: 2 }}
            size="small"
            InputLabelProps={{
              shrink: true, // Prevents label from overlapping the border
              sx: { fontSize: "12px" }, // Reduces label font size
            }}
          />
          <TextField
            label="Access Token"
            fullWidth
            variant="outlined"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            sx={{ ...inputStyles, mt: 2 }}
            size="small"
            InputLabelProps={{
              shrink: true, // Prevents label from overlapping the border
              sx: { fontSize: "12px" }, // Reduces label font size
            }}
          />
        </Box>

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
                Time {index + 1}
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
                Campaign Code
              </InputLabel>
              <Select
                value={schedule.campaign_code}
                onChange={(e) =>
                  handleScheduleChange(index, "campaign_code", e.target.value)
                }
                sx={selectStyles}
                MenuProps={menuProps}
              >
                {loading ? (
                  <MenuItem disabled>
                    <CircularProgress size={24} />
                  </MenuItem>
                ) : Array.isArray(campaignTypes) && campaignTypes.length > 0 ? (
                  campaignTypes.map((type) => (
                    <MenuItem key={type.id} value={type.campaign_code}>
                      {type.campaign_code}
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem disabled>No campaign types found</MenuItem>
                )}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" sx={{ mt: 2 }}>
              <InputLabel shrink sx={labelStyles}>
                Watch
              </InputLabel>
              <Select
                value={schedule.watch}
                onChange={(e) =>
                  handleScheduleChange(index, "watch", e.target.value)
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
      <DialogActions className="bg-gray-100 p-3">
        <CustomButton
          name="Create Schedule"
          onClick={handleSubmit}
          type="primary"
          className="bg-red-600 text-white"
        />
        <CustomButton
          name="Cancel"
          onClick={handleClose}
          type="secondary"
          className="bg-gray-300 text-black"
        />
      </DialogActions>
    </Dialog>
  );
};

export default AddAdAccountWidget;
