import time
import random
from database import insert_measurement, insert_alert

class BatterySimulator:
    def __init__(self, session_id, capacity_ah=100.0, initial_soc=50.0):
        self.session_id = session_id
        self.capacity_ah = capacity_ah
        self.soc = initial_soc
        self.voltage = 400.0 # Base nominal voltage
        self.temperature = 25.0
        self.current = 0.0
        self.is_running = False
        self.mode = "IDLE" # CHARGE, DISCHARGE, IDLE
        
    def start_charge(self, current_amps=50.0):
        self.mode = "CHARGE"
        self.current = current_amps
        self.is_running = True
        
    def start_discharge(self, current_amps=50.0):
        self.mode = "DISCHARGE"
        self.current = -abs(current_amps)
        self.is_running = True
        
    def stop(self):
        self.is_running = False
        self.mode = "IDLE"
        self.current = 0.0
        
    def step(self):
        if not self.is_running:
            return None
            
        # Add random noise
        voltage_noise = random.uniform(-1.0, 1.0)
        temp_noise = random.uniform(-0.1, 0.1)
        
        # Time delta in hours (assuming 1 step = 1 second in real life, but we simulate faster or real time)
        dt_hours = 1 / 3600.0
        
        # Update SOC
        self.soc += (self.current * dt_hours / self.capacity_ah) * 100.0
        self.soc = max(0.0, min(100.0, self.soc))
        
        # Update Voltage (simple linear model for demonstration)
        # SOC 0% -> 300V, SOC 100% -> 420V
        base_voltage = 300.0 + (self.soc / 100.0) * 120.0
        # Internal resistance drop
        ir_drop = self.current * 0.05 
        self.voltage = base_voltage + ir_drop + voltage_noise
        
        # Update Temperature
        # Heat generated = I^2 * R * dt (simplified)
        heat = (self.current ** 2) * 0.05 * dt_hours
        cooling = (self.temperature - 25.0) * 0.1 * dt_hours
        self.temperature += heat - cooling + temp_noise
        
        # Alerts checking
        if self.temperature > 45.0:
            insert_alert(self.session_id, f"High temperature detected: {self.temperature:.1f}C", "WARNING")
        if self.voltage < 310.0:
            insert_alert(self.session_id, f"Low voltage detected: {self.voltage:.1f}V", "WARNING")
        if self.voltage > 430.0:
            insert_alert(self.session_id, f"Over-voltage detected: {self.voltage:.1f}V", "CRITICAL")
            
        # Record
        insert_measurement(
            session_id=self.session_id,
            voltage=self.voltage,
            current=self.current,
            temperature=self.temperature,
            soc=self.soc,
            is_simulated=True
        )
        
        return {
            "voltage": self.voltage,
            "current": self.current,
            "temperature": self.temperature,
            "soc": self.soc
        }
