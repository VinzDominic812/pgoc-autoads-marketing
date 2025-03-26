import React, { useEffect, useRef, useState } from "react";
import { FiRotateCcw } from "react-icons/fi";
import WidgetCard from "../../components/widget_card";

const OnOffTerminal = ({ messages, setMessages }) => {
  const terminalRef = useRef(null);
  const [currentTime, setCurrentTime] = useState("");

  // Function to reset terminal
  const resetTerminal = () => {
    setMessages(["Terminal reset."]);
  };

  // Auto-scroll when messages update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages]);

  // Update clock every second with Manila time
  // Function to update the clock every second with fixed Manila time
  useEffect(() => {
    const updateClock = () => {
      // Get UTC time and adjust to Manila time (UTC+8)
      const now = new Date();
      now.setUTCHours(now.getUTCHours() + 8); // Convert UTC to Manila Time (UTC+8)

      // Format the time
      const formattedTime = now.toISOString().replace("T", " ").split(".")[0]; // YYYY-MM-DD HH:MM:SS format

      setCurrentTime(`⏳ Current Time: ${formattedTime} (PH Time)`);
    };

    updateClock(); // Initial call
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <WidgetCard height="350px" width="550px">
      <div className="relative w-full h-full bg-[#D32F2F] rounded-lg shadow-xl border border-gray-700 p-2">
        {/* Reset button */}
        <button
          onClick={resetTerminal}
          className="absolute top-3 right-3 p-1 rounded-full bg-red-600 z-10 hover:bg-red-800"
          title="Reset Terminal"
        >
          <FiRotateCcw className="text-white" />
        </button>

        {/* Terminal Box */}
        <div
          ref={terminalRef}
          className="relative w-full h-[280px] bg-white text-white font-mono p-4 rounded-lg border border-gray-700 shadow-xl overflow-y-auto"
        >
          {/* Messages Display */}
          <div className="flex flex-col space-y-1">
            {messages.length > 0 ? (
              messages.map((message, index) => (
                <div key={index} className="text-xs text-gray-800">
                  {message}
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-600 italic">
                ⚡ Select Ad_Account...
              </div>
            )}
          </div>
        </div>

        {/* Live Clock */}
        <div className="absolute bottom-1 left-0 right-0 text-center text-xs font-mono text-black ">
          {currentTime}
        </div>
      </div>
    </WidgetCard>
  );
};

export default OnOffTerminal;
