'use client';
import React from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Card, CardContent, Typography, IconButton, Stack } from '@mui/material';
import { Delete } from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';

export default function ItineraryEditor({ value = [], onChange }: any) {
  const list = value;

  function onDragEnd(result:any) {
    if (!result.destination) return;
    const srcIdx = result.source.index;
    const destIdx = result.destination.index;
    const newList = Array.from(list);
    const [moved] = newList.splice(srcIdx, 1);
    newList.splice(destIdx, 0, moved);
    onChange(newList);
  }

  function removeItem(idx:number) {
    const newList = Array.from(list);
    newList.splice(idx, 1);
    onChange(newList);
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="itinerary">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            {list.map((day:any, dayIdx:number) => (
              <Draggable key={day.id || uuidv4()} draggableId={day.id || `d-${dayIdx}`} index={dayIdx}>
                {(p) => (
                  <div ref={p.innerRef} {...p.draggableProps} style={{ marginBottom: 12, ...p.draggableProps.style }}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <div {...p.dragHandleProps} style={{ cursor: 'grab', padding: 4 }}>
                              ☰
                            </div>
                            <div>
                              <Typography variant="h6">{day.title || `Day ${dayIdx + 1}`}</Typography>
                              <Typography variant="caption">{day.date || ''}</Typography>
                            </div>
                          </div>

                          <IconButton color="inherit" onClick={() => removeItem(dayIdx)}>
                            <Delete />
                          </IconButton>
                        </Stack>

                        {/* items */}
                        <div style={{ marginTop: 12 }}>
                          {(day.items || []).map((it:any, idx:number) => (
                            <div key={it.id || idx} style={{ padding: '8px 0', borderBottom: '1px dashed rgba(0,0,0,0.06)' }}>
                              <Typography variant="subtitle2">{it.title}</Typography>
                              <Typography variant="body2">{it.description}</Typography>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
