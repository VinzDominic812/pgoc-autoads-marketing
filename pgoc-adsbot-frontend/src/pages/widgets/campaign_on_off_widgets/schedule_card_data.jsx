import React, { useState, useEffect } from "react";
import { Box, Card, CardContent, Typography, Divider } from "@mui/material";
import { IconButton } from "@mui/material";
import WidgetCard from "../../components/widget_card";
import CustomButton from "../../components/buttons";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CampaignIcon from "@mui/icons-material/Campaign";
import UpIcon from "@mui/icons-material/North";
import DownIcon from "@mui/icons-material/South";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";

import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { getUserData } from "../../../services/user_data";
import notify from "../../components/toast";
import AddScheduleDataDialog from "../campaign_on_off_widgets/ad_schedule_dialog";
import EditScheduleDataDialog from "./edit_schedule_dialog";

const apiUrl = import.meta.env.VITE_API_URL;

//deploy

const convertTo12HourFormat = (timeStr) => {
  if (!timeStr) return "Invalid Time";
  const [hours, minutes] = timeStr.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix} (PH Time)`;
};

const ScheduleCardData = ({ selectedAccount, setSelectedAccount }) => {
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [scheduleData, setScheduleData] = useState({});
  const [selectedScheduleData, setSelectedScheduleData] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [openEditDialog, setEditOpenDialog] = useState(false);

  useEffect(() => {
    setScheduleData(selectedAccount?.schedule_data || {});
  }, [selectedAccount]);

  const handleCardClick = (key) => {
    if (selectedSchedule === key) {
      // If already selected, unselect it
      setSelectedSchedule(null);
      setSelectedScheduleData(null);
      console.log("Unselected Schedule");
    } else {
      // Select new schedule
      const selectedData = scheduleData[key] || null;
      const updatedSelectedData = selectedData
        ? { ...selectedData, ad_account_id: selectedAccount.ad_account_id }
        : null;

      setSelectedSchedule(key);
      setSelectedScheduleData(updatedSelectedData);

      // Log the correct updated data
      console.log("Selected Schedule Key:", key);
      console.log(
        "Selected Schedule Data:",
        JSON.stringify(updatedSelectedData)
      );
    }
  };

  useEffect(() => {
    if (selectedAccount?.schedule_data) {
      setScheduleData({ ...selectedAccount.schedule_data });
    }
  }, [selectedAccount?.schedule_data]);

  const handleRemoveSchedule = async () => {
    if (!selectedScheduleData) return;
  
    const { id } = getUserData();
  
    const requestBody = {
      id,
      ad_account_id: selectedAccount.ad_account_id,
      time: selectedScheduleData.time,
      campaign_code: selectedScheduleData.campaign_code, // Make sure this matches the backend
      watch: selectedScheduleData.watch,
      cpp_metric: selectedScheduleData.cpp_metric,
      on_off: selectedScheduleData.on_off,
    };
  
    console.log("Removing Schedule:", requestBody);
  
    try {
      const response = await fetch(
        `${apiUrl}/api/v1/schedule/remove-schedule-time`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            skip_zrok_interstitial: "true",
          },
          body: JSON.stringify(requestBody),
        }
      );
  
      if (!response.ok)
        throw new Error(`Error ${response.status}: ${response.statusText}`);
  
      setScheduleData((prev) => {
        const updatedSchedule = Object.fromEntries(
          Object.entries(prev).filter(([key]) => key !== selectedSchedule)
        );
        return updatedSchedule;
      });
  
      setSelectedAccount((prev) => ({
        ...prev,
        schedule_data: Object.fromEntries(
          Object.entries(prev.schedule_data || {}).filter(
            ([key]) => key !== selectedSchedule
          )
        ),
      }));
  
      setSelectedSchedule(null);
      setSelectedScheduleData(null);
    } catch (error) {
      console.error("Error removing schedule:", error);
    }
  };  

  const handleUpdateSchedule = (updatedSchedule) => {
    setScheduleData((prev) => ({
      ...prev,
      [selectedSchedule]: updatedSchedule,
    }));

    setSelectedScheduleData(updatedSchedule);
  };

  const handleUpdateScheduleStatus = async (newStatus) => {
    if (!selectedSchedule || !selectedScheduleData) {
      console.error("Error: No schedule selected.");
      return;
    }

    // UI Update Before API Call
    setScheduleData((prev) => {
      if (!prev[selectedSchedule]) return prev; // Prevent undefined errors
      return {
        ...prev,
        [selectedSchedule]: {
          ...prev[selectedSchedule],
          status: newStatus, // Only update the status key
        },
      };
    });

    setSelectedScheduleData((prev) =>
      prev ? { ...prev, status: newStatus } : null
    );

    const { id: user_id } = getUserData();
    const payload = {
      ad_account_id: selectedScheduleData.ad_account_id,
      user_id,
      access_token: selectedAccount?.access_token, // grab this from selectedAccount
      schedule_data: [
        {
          ...selectedScheduleData,
          status: newStatus,
        },
      ],
    };

    console.log("Calling API with payload:", payload); // ✅ Debugging API Call

    try {
      const response = await fetch(`${apiUrl}/api/v1/schedule/pause-schedule`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          skip_zrok_interstitial: "true",
        },
        body: JSON.stringify(payload),
      });

      console.log("API Response Status:", response.status); // ✅ Debugging

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update schedule: ${errorText}`);
      }

      notify("Status Changed successfully!", "success");
    } catch (error) {
      console.error("Error updating status:", error);
      notify(`Error: ${error.message}`, "error");
    }
  };

  return (
    <WidgetCard sx={{ padding: 3, height: "650px", overflow: "hidden" }}>
      {!selectedAccount ? (
        <Box
          sx={{
            textAlign: "center",
            padding: "40px",
            color: "#666",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: "bold", color: "#444" }}>
            📌 No Ad Account Selected
          </Typography>
          <Typography variant="body2" sx={{ marginTop: "8px", color: "#777" }}>
            Please select an ad account to view its schedule details.
          </Typography>
        </Box>
      ) : (
        <>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 2,
            }}
          >
            <Typography variant="h7" sx={{ fontWeight: "bold", color: "#222" }}>
              Schedule Details
            </Typography>
            <Box sx={{ display: "flex", gap: "10px" }}>
              <IconButton
                onClick={() =>
                  handleUpdateScheduleStatus(
                    selectedScheduleData?.status === "Running"
                      ? "Paused"
                      : "Running"
                  )
                }
                disabled={!selectedScheduleData}
                sx={{
                  backgroundColor:
                    selectedScheduleData?.status === "Paused"
                      ? "#4CAF50"
                      : "#D32F2F",
                  color: "#FFFFFF",
                  width: "30px",
                  height: "30px",
                  "&:hover": {
                    backgroundColor:
                      selectedScheduleData?.status === "Paused"
                        ? "#388E3C"
                        : "#B71C1C",
                  },
                }}
              >
                {selectedScheduleData?.status === "Paused" ? (
                  <PlayArrowIcon fontSize="small" />
                ) : (
                  <PauseIcon fontSize="small" />
                )}
              </IconButton>
              <IconButton
                onClick={() => setEditOpenDialog(true)}
                disabled={!selectedSchedule}
                sx={{
                  backgroundColor: "#D32F2F",
                  color: "#FFFFFF",
                  width: "30px",
                  height: "30px",
                  "&:hover": { backgroundColor: "#B71C1C" },
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton
                onClick={() => setOpenDialog(true)}
                sx={{
                  backgroundColor: "#D32F2F", // Red color
                  color: "#FFFFFF",
                  width: "30px",
                  height: "30px",
                  minWidth: "30px",
                  padding: "5px",
                  "&:hover": {
                    backgroundColor: "#B71C1C", // Darker red on hover
                  },
                }}
              >
                <AddIcon fontSize="small" />
              </IconButton>

              <IconButton
                onClick={handleRemoveSchedule}
                disabled={!selectedSchedule}
                sx={{
                  border: "1.5px solid #B0BEC5", // Gray outline
                  color: "#455A64",
                  backgroundColor: "transparent",
                  width: "30px",
                  height: "30px",
                  minWidth: "30px",
                  padding: "5px",
                  "&:hover": {
                    backgroundColor: "#ECEFF1", // Light gray hover
                  },
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          <Box
            sx={{ maxHeight: "540px", overflowY: "auto", paddingRight: "5px" }}
          >
            {Object.keys(scheduleData).length > 0 ? (
              Object.entries(scheduleData).map(([key, schedule]) => (
                <Card
                  key={key}
                  onClick={() => handleCardClick(key)}
                  sx={{
                    padding: 2,
                    marginBottom: 2,
                    borderLeft:
                      selectedSchedule === key
                        ? "6px solid #007BFF"
                        : "6px solid #D0D0D0",
                    backgroundColor:
                      selectedSchedule === key ? "#E3F2FD" : "#FAFAFA",
                    cursor: "pointer",
                    transition: "background 0.3s, border 0.3s",
                    boxShadow:
                      selectedSchedule === key
                        ? "0px 4px 10px rgba(0, 123, 255, 0.2)"
                        : "none",
                    "&:hover": { backgroundColor: "#F0F8FF" },
                  }}
                >
                  <CardContent>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        marginBottom: 1,
                      }}
                    >
                      <ScheduleIcon sx={{ color: "#007BFF" }} />
                      <Typography
                        variant="body1"
                        sx={{ fontWeight: "bold", color: "#222" }}
                      >
                        {schedule.time} {" → "}{" "}
                        {convertTo12HourFormat(schedule.time)}
                      </Typography>
                    </Box>

                    <Divider sx={{ marginBottom: 1 }} />

                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        marginBottom: 1,
                      }}
                    >
                      <CampaignIcon sx={{ color: "#ff9800" }} />
                      <Typography variant="body2" sx={{ color: "#444" }}>
                        <b>Campaign Code:</b> {schedule.campaign_code}
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        marginBottom: 1,
                      }}
                    >
                      <TrendingUpIcon sx={{ color: "#4caf50" }} />
                      <Typography variant="body2" sx={{ color: "#444" }}>
                        <b>CPP Metric:</b> {schedule.cpp_metric}
                        {schedule.on_off === "OFF" ? (
                          <UpIcon sx={{ color: "green" }} fontSize="12px" />
                        ) : (
                          <DownIcon sx={{ color: "green" }} fontSize="12px" />
                        )}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        marginBottom: 1,
                      }}
                    >
                      {schedule.status === "Running" ? (
                        <PlayArrowIcon sx={{ color: "#4CAF50" }} />
                      ) : schedule.status === "Paused" ? (
                        <PauseIcon sx={{ color: "#F44336" }} />
                      ) : null}

                      <Typography
                        variant="body2"
                        sx={{ color: "#444", marginRight: "10px" }}
                      >
                        <b>{schedule.status}</b>
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        marginBottom: 1,
                      }}
                    >
                      <PowerSettingsNewIcon
                        sx={{
                          color:
                            schedule.on_off === "ON" ? "#4caf50" : "#f44336",
                        }}
                      />
                      <Typography variant="body2" sx={{ color: "#444" }}>
                        <b>On/Off:</b> {schedule.on_off}
                      </Typography>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <VisibilityIcon sx={{ color: "#673ab7" }} />
                      <Typography variant="body2" sx={{ color: "#444" }}>
                        <b>Watch:</b> {schedule.watch}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Typography sx={{ textAlign: "center", color: "#666" }}>
                No schedule data available.
              </Typography>
            )}
          </Box>

          <EditScheduleDataDialog
            open={openEditDialog}
            handleClose={() => setEditOpenDialog(false)}
            selectedSchedule={selectedScheduleData}
            handleEdit={handleUpdateSchedule}
          />

          {/* Add Schedule Dialog */}
          <AddScheduleDataDialog
            open={openDialog}
            handleClose={() => setOpenDialog(false)}
            adAccountId={selectedAccount?.ad_account_id}
            accessToken={selectedAccount?.access_token}
            setSelectedAccount={setSelectedAccount}
          />
        </>
      )}
    </WidgetCard>
  );
};

export default ScheduleCardData;
