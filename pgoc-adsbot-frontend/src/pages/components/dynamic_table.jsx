import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  Box,
  Checkbox,
  Tooltip,
  Button,
  TextField,
} from "@mui/material";

const DynamicTable = ({
  headers,
  data,
  rowsPerPage = 5,
  containerStyles = {},
  onDataChange,
  columnWidth,
  // onSelectedChange,
  nonEditableHeaders = [],
  customRenderers = {}, //icons
}) => {
  const [page, setPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState(new Map());
  const [editedData, setEditedData] = useState(data);
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  // Update table when `data` or `headers` change
  useEffect(() => {
    setEditedData(data);
    setSelectedRows(new Map()); // Reset selected rows
    setPage(1); // Reset page if data changes
  }, [data, headers]);

  //   // Trigger parent callback on selection change
  // useEffect(() => {
  //   onSelectedChange(selectedRows);
  // }, [selectedRows]);

  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedData = editedData.slice(startIndex, endIndex);

  const handleSelect = (rowIndex) => {
    setSelectedRows((prevSelected) => {
      const newSelected = new Map(prevSelected);
      const currentPageSelections = newSelected.get(page) || new Set();

      if (currentPageSelections.has(rowIndex)) {
        currentPageSelections.delete(rowIndex);
      } else {
        currentPageSelections.add(rowIndex);
      }

      newSelected.set(page, currentPageSelections);
      return newSelected;
    });
  };

  const handleSelectAll = () => {
    setSelectedRows((prevSelected) => {
      const newSelected = new Map(prevSelected);
      const currentPageSelections = newSelected.get(page) || new Set();

      if (paginatedData.every((_, index) => currentPageSelections.has(index))) {
        newSelected.set(page, new Set());
      } else {
        const allOnPage = new Set(paginatedData.map((_, index) => index));
        newSelected.set(page, allOnPage);
      }

      return newSelected;
    });
  };

  const startEditing = (rowIndex, columnKey, event) => {
    if (nonEditableHeaders.includes(columnKey)) return; // Prevent editing

    setEditingCell({
      rowIndex,
      columnKey,
      position: {
        left: event.currentTarget.getBoundingClientRect().left,
        top: event.currentTarget.getBoundingClientRect().top - 45,
        width: event.currentTarget.offsetWidth,
      },
    });
    setEditValue(editedData[startIndex + rowIndex][columnKey]);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const applyEdit = () => {
    setEditedData((prevData) => {
      const newData = [...prevData];
      newData[startIndex + editingCell.rowIndex] = {
        ...newData[startIndex + editingCell.rowIndex],
        [editingCell.columnKey]: editValue,
      };
      if (onDataChange) onDataChange(newData); // NEW: Send updated data to parent
      return newData;
    });
    cancelEdit();
  };
  return (
    <Paper
      sx={{
        display: "flex",
        flexDirection: "column",
        borderRadius: "8px",
        boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        width: "91vw", // Makes it 95% of the screen width
        height: "450px",
        maxWidth: "95vw", // Prevents exceeding the screen width
      }}
    >
      {/* Table with Horizontal Scroll */}
      <TableContainer sx={{ flexGrow: 1, overflowY: "auto", maxWidth: "100%", }}>
        <Table stickyHeader sx={{ minWidth: "800px", tableLayout: "fixed" }}>
          <TableHead>
            <TableRow sx={{ height: "30px" }}>
              {/* <TableCell
                sx={{
                  backgroundColor: "#d32f2f",
                  color: "white",
                  fontWeight: "bold",
                  padding: "8px",
                  textAlign: "center",
                  width: `${100 / (headers.length + 2)}%`,
                }}
              >
                <Checkbox
                  sx={{ color: "white", padding: "2px" }}
                  checked={paginatedData.every((_, index) =>
                    selectedRows.get(page)?.has(index)
                  )}
                  indeterminate={
                    paginatedData.some((_, index) =>
                      selectedRows.get(page)?.has(index)
                    ) &&
                    !paginatedData.every((_, index) =>
                      selectedRows.get(page)?.has(index)
                    )
                  }
                  onChange={handleSelectAll}
                />
              </TableCell> */}
              {/* <TableCell
                sx={{
                  backgroundColor: "#d32f2f",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: "bold",
                  textAlign: "center",
                  padding: "8px",
                  width: `${100 / (headers.length + 2)}%`,
                }}
              >
                #
              </TableCell> */}
              {headers.map((header, index) => (
                <TableCell
                  key={index}
                  sx={{
                    backgroundColor: "#d32f2f",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: "bold",
                    textAlign: "center",
                    padding: "8px",
                    whiteSpace: "nowrap",
                    width: "150px",
                  }}
                >
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                sx={{
                  backgroundColor: rowIndex % 2 === 0 ? "#fafafa" : "white",
                  transition: "background 0.3s",
                  "&:hover": { backgroundColor: "#f5f5f5" },
                }}
              >
                {/* <TableCell
                  sx={{ textAlign: "center", padding: "8px", width: `${100 / (headers.length + 2)}%` }}
                >
                  <Checkbox
                    color="primary"
                    checked={selectedRows.get(page)?.has(rowIndex) || false}
                    onChange={() => handleSelect(rowIndex)}
                    sx={{ padding: "2px" }}
                  />
                </TableCell>
                <TableCell
                  sx={{
                    textAlign: "center",
                    fontWeight: "bold",
                    padding: "8px",
                    width: `${100 / (headers.length + 2)}%`,
                  }}
                >
                  {startIndex + rowIndex + 1}
                </TableCell> */}
                {headers.map((header, colIndex) => (
                  <TableCell
                    key={colIndex}
                    sx={{
                      textAlign: "center",
                      fontSize: "13px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      padding: "8px",
                      width: "150px",
                      cursor: "pointer",
                    }}
                    onClick={(event) => startEditing(rowIndex, header, event)}
                  >
                    {editingCell?.rowIndex === rowIndex &&
                    editingCell?.header === header ? (
                      <TextField
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        variant="outlined"
                        size="small"
                        multiline
                        minRows={3}
                        maxRows={5}
                        sx={{
                          width: "100%",
                          fontSize: "12px",
                          "& .MuiInputBase-root": {
                            padding: "6px",
                          },
                        }}
                      />
                    ) : customRenderers[header] ? (
                      customRenderers[header](row[header])
                    ) : (
                      <Tooltip title={row[header]}>
                        <span
                          style={{
                            display: "block",
                            width: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            padding: "8px",
                          }}
                        >
                          {row[header]}
                        </span>
                      </Tooltip>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <Box sx={{ display: "flex", justifyContent: "center", padding: "8px" }}>
        <Pagination
          count={Math.ceil(data.length / rowsPerPage)}
          page={page}
          onChange={handleChangePage}
          size="small"
          color="standard"
          sx={{
            "& .MuiPaginationItem-root": {
              color: "red",
              fontWeight: "bold",
            },
            "& .Mui-selected": {
              backgroundColor: "#FF0000",
              color: "white",
              fontWeight: "bold",
            },
            "& .MuiPaginationItem-root:hover": {
              backgroundColor: "#ffebee",
            },
            marginBottom: "6px",
          }}
        />
      </Box>
      {/* Edit Container */}
      {editingCell && (
        <Box
          sx={{
            position: "fixed",
            top: `${editingCell.position.top}px`,
            left: `${editingCell.position.left}px`,
            backgroundColor: "white",
            boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.2)",
            borderRadius: "8px",
            padding: "8px",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "4px",
            width: `150px`,
            flexDirection: "column",
          }}
        >
          <TextField
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            variant="outlined"
            size="small"
            multiline
            minRows={3}
            maxRows={5}
            sx={{
              width: "100%",
              fontSize: "12px",
              "& .MuiInputBase-root": {
                padding: "6px",
              },
            }}
          />
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <Button
              onClick={applyEdit}
              size="small"
              sx={{
                backgroundColor: "red",
                color: "white",
                padding: "2px 8px",
                fontSize: "10px",
                "&:hover": { backgroundColor: "#b71c1c" },
              }}
            >
              Apply
            </Button>
            <Button
              onClick={cancelEdit}
              size="small"
              sx={{
                color: "black",
                padding: "2px 8px",
                fontSize: "10px",
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
};
export default DynamicTable;
