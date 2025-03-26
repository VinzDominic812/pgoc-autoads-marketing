import React, { useState, useEffect } from "react";
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
  Box,
  Grid,
  Typography,
} from "@mui/material";
import CustomButton from "../../components/buttons";
import notify from "../../components/toast";
import { getUserData } from "../../../services/user_data";

const generateHourOptions = () =>
  Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const generateMinuteOptions = () =>
  Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

const apiUrl = import.meta.env.VITE_API_URL;

const OnlyEditScheduleDataDialog = ({
  open,
  handleClose,
  selectedSchedule,
  handleEdit,
  fetchSchedule
}) => {
  const [scheduleData, setScheduleData] = useState({
    hour: "",
    minute: "",
    on_off: "",
    campaign_name: "",
  });

  useEffect(() => {
    if (selectedSchedule) {
      setScheduleData({
        hour: selectedSchedule?.time?.split(":")[0] || "",
        minute: selectedSchedule?.time?.split(":")[1] || "",
        on_off: selectedSchedule?.on_off || "",
        campaign_name: selectedSchedule?.campaign_name?.join(" / ") || "",
      });
    }
  }, [selectedSchedule]);

  const handleScheduleChange = (field, value) => {
    setScheduleData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!selectedSchedule) {
      notify("No schedule selected!", "error");
      return;
    }

    const { id } = getUserData();
    const updatedTime = `${scheduleData.hour}:${scheduleData.minute}`;

    const payload = {
      id,
      ad_account_id: selectedSchedule.ad_account_id,
      time: selectedSchedule.time, // Original time
      new_time: updatedTime,
      new_on_off: scheduleData.on_off,
      new_campaign_name: scheduleData.campaign_name.split(" / "),
    };

    const updatedSchedule = {
      ...selectedSchedule,
      time: updatedTime,
      on_off: scheduleData.on_off,
      campaign_name: scheduleData.campaign_name.split(" / "),
    };

    try {
      const response = await fetch(`${apiUrl}/api/v1/campaign-only/edit-time`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update schedule: ${errorText}`);
      }

      // ✅ Update UI Immediately
      handleEdit(updatedSchedule);

      notify("Schedule updated successfully!", "success");
      handleClose();
    } catch (error) {
      console.error("Error updating schedule:", error);
      notify(error.message, "error");
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle className="bg-red-600 text-white text-center font-bold">
        Edit Schedule
      </DialogTitle>
      <DialogContent
        dividers
        className="max-h-[500px] overflow-y-auto bg-gray-100 p-4"
      >
        <Box className="border border-gray-300 bg-white p-4 rounded-lg mt-4 shadow-md">
          <Typography
            variant="subtitle1"
            className="text-gray-700 font-semibold"
          >
            Edit Schedule
          </Typography>

          <Grid container spacing={2} className="mt-2">
            {/* Hour Selection */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                <InputLabel>Hour (00-23)</InputLabel>
                <Select
                  value={scheduleData.hour}
                  onChange={(e) => handleScheduleChange("hour", e.target.value)}
                >
                  {generateHourOptions().map((hour) => (
                    <MenuItem key={hour} value={hour}>
                      {hour}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Minute Selection */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                <InputLabel>Minute (00-59)</InputLabel>
                <Select
                  value={scheduleData.minute}
                  onChange={(e) =>
                    handleScheduleChange("minute", e.target.value)
                  }
                >
                  {generateMinuteOptions().map((minute) => (
                    <MenuItem key={minute} value={minute}>
                      {minute}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* ON/OFF Selection */}
          <FormControl fullWidth size="small" sx={{ mt: 2 }}>
            <InputLabel>ON/OFF</InputLabel>
            <Select
              value={scheduleData.on_off}
              onChange={(e) => handleScheduleChange("on_off", e.target.value)}
            >
              <MenuItem value="ON">ON</MenuItem>
              <MenuItem value="OFF">OFF</MenuItem>
            </Select>
          </FormControl>

          {/* Campaign Name Input */}
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Campaign Name(s)"
            value={scheduleData.campaign_name}
            onChange={(e) =>
              handleScheduleChange("campaign_name", e.target.value)
            }
            helperText="Separate campaign names using '/'"
            sx={{ mt: 2 }}
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <CustomButton name="Cancel" onClick={handleClose} type="secondary" />
        <CustomButton
          name="Save Changes"
          onClick={handleSubmit}
          type="primary"
        />
      </DialogActions>
    </Dialog>
  );
};

export default OnlyEditScheduleDataDialog;
