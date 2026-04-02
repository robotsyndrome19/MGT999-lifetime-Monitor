export interface RobotAxisData {
  temp: number;
  torque: number;
  current: number;
}

export interface CylinderData {
  lifetime_act: number;
  limit_lifetime: number;
  reed_open: boolean;
  reed_close: boolean;
}

export interface RobotData {
  robot_lifetime: {
    runtime: number;
  };
  robot_axis: {
    [key: string]: RobotAxisData;
  };
  gripper: {
    [key: string]: CylinderData;
  };
}
