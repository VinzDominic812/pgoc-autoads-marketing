import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Divider,
  Tooltip,
  IconButton,
} from "@mui/material";
import WidgetCard from "../../components/widget_card";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CampaignIcon from "@mui/icons-material/Campaign";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import { getUserData } from "../../../services/user_data";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import OnlyEditScheduleDataDialog from "../../widgets/only_campaign_name/only_edit_schedule";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import notify from "../../components/toast";

const apiUrl = import.meta.env.VITE_API_URL;

const gradientColors = [
  "linear-gradient(45deg, #FF5722, #FF9800)",
  "linear-gradient(45deg, #4CAF50, #8BC34A)",
  "linear-gradient(45deg, #3F51B5, #2196F3)",
  "linear-gradient(45deg, #9C27B0, #E91E63)",
  "linear-gradient(45deg, #FFC107, #FFEB3B)",
];

const convertTo12HourFormat = (timeStr) => {
  if (!timeStr) return "Invalid Time";
  const [hours, minutes] = timeStr.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix} (PH Time)`;
};

const OnlyScheduleCardData = ({
  selectedAccount,
  setSelectedAccount,
  fetchSchedule,
}) => {
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [scheduleData, setScheduleData] = useState({});
  const [selectedScheduleData, setSelectedScheduleData] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);

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

  const handleRemoveSchedule = async () => {
    if (!selectedScheduleData) return;
    const { id } = getUserData();
    const requestBody = {
      id: parseInt(id),
      ad_account_id: selectedAccount.ad_account_id,
      time: selectedScheduleData.time,
    };
    console.log(JSON.stringify(requestBody));

    try {
      const response = await fetch(
        `${apiUrl}/api/v1/campaign-only/remove-schedule`,
        {
          method: "DELETE",
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

    const { id } = getUserData();
    const payload = {
      id,
      ad_account_id: selectedScheduleData.ad_account_id, // Ensure this exists
      time: selectedScheduleData.time, // Keep original time
      new_status: newStatus,
    };

    console.log("Calling API with payload:", payload); // ✅ Debugging API Call

    try {
      const response = await fetch(`${apiUrl}/api/v1/campaign-only/edit-time`, {
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
    <WidgetCard width={"400px"}>
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
            🕑 Schedules
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
                onClick={() => setOpenDialog(true)}
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
                onClick={handleRemoveSchedule}
                disabled={!selectedSchedule}
                sx={{
                  border: "1.5px solid #B0BEC5",
                  color: "#455A64",
                  width: "30px",
                  height: "30px",
                  "&:hover": { backgroundColor: "#ECEFF1" },
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

                    {schedule.campaign_name?.length > 0 ? (
                      <Box sx={{ marginTop: 2 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: "bold",
                            color: "#222",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <CampaignIcon
                            sx={{
                              fontSize: "28px",
                              marginRight: "8px",
                              color: "#1976D2",
                            }}
                          />
                          Campaign Names
                        </Typography>
                        <Box
                          sx={{
                            maxHeight: "100px",
                            overflowY: "auto",
                            backgroundColor: "#F5F5F5",
                            padding: "8px",
                            borderRadius: "8px",
                            marginTop: "8px",
                            border: "1px solid #E0E0E0",
                          }}
                        >
                          {schedule.campaign_name.map((campaign, index) => (
                            <Tooltip
                              key={index}
                              title={campaign}
                              placement="top-start"
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  padding: "6px 0",
                                  fontWeight: "bold",
                                  background:
                                    gradientColors[
                                      index % gradientColors.length
                                    ], // Apply color gradient
                                  WebkitBackgroundClip: "text",
                                  WebkitTextFillColor: "transparent",
                                }}
                              >
                                <FiberManualRecordIcon
                                  sx={{
                                    fontSize: "12px",
                                    marginRight: "8px",
                                    color: "#555",
                                  }}
                                />
                                {campaign}
                              </Typography>
                            </Tooltip>
                          ))}
                        </Box>
                      </Box>
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{ color: "#777", fontStyle: "italic" }}
                      >
                        No campaigns available.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Typography sx={{ textAlign: "center", color: "#666" }}>
                No schedule data available.
              </Typography>
            )}
          </Box>
          <OnlyEditScheduleDataDialog
            open={openDialog}
            handleClose={() => setOpenDialog(false)}
            selectedSchedule={selectedScheduleData}
            handleEdit={handleUpdateSchedule}
            fetchSchedule={fetchSchedule}
          />
          ;
        </>
      )}
    </WidgetCard>
  );
};

export default OnlyScheduleCardData;
