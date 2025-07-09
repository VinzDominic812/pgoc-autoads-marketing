import React, { useEffect, useRef, useState } from "react";
import { FiRotateCcw } from "react-icons/fi";
import WidgetCard from "../../components/widget_card";

const EditBudgetTerminal = ({ messages, setMessages }) => {
  const terminalRef = useRef(null);
  const [currentTime, setCurrentTime] = useState("");

  // Function to reset terminal
  const resetTerminal = () => {
    setMessages({ global: ["Terminal reset."] });
  };

  // Auto-scroll when messages update
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages]);

  // Update clock every second with Manila time
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      now.setUTCHours(now.getUTCHours() + 8);
      const formattedTime = now.toISOString().replace("T", " ").split(".")[0];
      setCurrentTime(`⏳ Current Time: ${formattedTime} (PH Time)`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <WidgetCard title="Second Column" height="275px" width="100%">
      <div className="relative w-full h-[250px] bg-[#D32F2F] rounded-lg shadow-xl border border-gray-700 p-2">
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
          className="relative w-full h-[94%] bg-white text-white font-mono p-4 rounded-lg border border-gray-700 shadow-xl overflow-y-auto"
        >
          {/* Messages Display */}
          <div className="flex flex-col space-y-1">
            {Object.values(messages).flat().length > 0 ? (
              Object.values(messages)
                .flat()
                .map((message, index) => (
                  <div key={index} className="text-xs text-gray-800">
                    {message}
                  </div>
                ))
            ) : (
              <div className="text-xs text-gray-600 italic">
                ⚡ Waiting For Run...
              </div>
            )}
          </div>
        </div>

        {/* Live Clock */}
        <div className="absolute bottom-1 left-0 right-0 text-center text-xs font-mono text-black">
          {currentTime}
        </div>
      </div>
    </WidgetCard>
  );
};

export default EditBudgetTerminal;
