package com.campusverse.service;

import com.campusverse.dao.RoomDAO;
import com.campusverse.model.Room;
import com.campusverse.util.SecurityUtils;

import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

public class GhostRoomService {

    private final RoomDAO roomDAO;
    private final Clock clock;

    public GhostRoomService() {
        this(new RoomDAO(), Clock.systemUTC());
    }

    public GhostRoomService(RoomDAO roomDAO, Clock clock) {
        this.roomDAO = roomDAO;
        this.clock = clock != null ? clock : Clock.systemUTC();
    }

    public Room createGhostRoom(String rawName, String durationStr) throws SQLException {
        if (rawName == null || rawName.trim().isEmpty()) {
            throw new IllegalArgumentException("Room name cannot be blank");
        }
        String name = rawName.trim();
        if (name.length() > 100) {
            throw new IllegalArgumentException("Room name cannot exceed 100 characters");
        }

        Duration duration = parseDuration(durationStr);
        Instant now = clock.instant();
        Instant expiresAt = now.plus(duration);

        Room room = new Room();
        room.setName(SecurityUtils.escapeHtml(name));
        room.setType("GHOST");
        room.setCreatedAt(Timestamp.from(now));
        room.setExpiresAt(Timestamp.from(expiresAt));
        room.setStatus("ACTIVE");

        return roomDAO.createRoom(room);
    }

    public List<Room> getGhostRooms() throws SQLException {
        List<Room> rooms = roomDAO.findAllGhostRooms();
        Instant now = clock.instant();

        for (Room r : rooms) {
            if ("ACTIVE".equalsIgnoreCase(r.getStatus()) && r.getExpiresAt() != null) {
                if (!now.isBefore(r.getExpiresAt().toInstant())) {
                    r.setStatus("CLOSED");
                    roomDAO.updateStatus(r.getId(), "CLOSED");
                }
            }
        }
        return rooms;
    }

    public boolean isRoomExpired(Room room) {
        if (room == null) return true;
        if ("CLOSED".equalsIgnoreCase(room.getStatus())) return true;
        if (room.getExpiresAt() != null) {
            return !clock.instant().isBefore(room.getExpiresAt().toInstant());
        }
        return false;
    }

    private Duration parseDuration(String input) {
        if (input == null || input.trim().isEmpty()) {
            return Duration.ofMinutes(5); // default
        }
        String s = input.trim().toLowerCase(java.util.Locale.ROOT);
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("([0-9]+)\\s*(m|mins?|minutes?|h|hours?|d|days?)?").matcher(s);
        if (!m.matches()) throw new IllegalArgumentException("Use a duration such as 5m, 2h or 1d");
        try {
            long n = Long.parseLong(m.group(1));
            String unit = m.group(2);
            long multiplier = unit != null && unit.startsWith("h") ? 60 : unit != null && unit.startsWith("d") ? 1440 : 1;
            long minutes = Math.multiplyExact(n, multiplier);
            if (minutes < 1 || minutes > 1440) throw new IllegalArgumentException("Duration must be between 1 minute and 24 hours");
            return Duration.ofMinutes(minutes);
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("Invalid duration", e);
        }
    }
}
