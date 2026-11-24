import { DEFAULT_TIERS } from './core.mjs';

export const SAMPLE_GAME = {
  tiers: structuredClone(DEFAULT_TIERS),
  questions: [
    {
      id: 'practice-drive',
      prompt: 'Name a drivetrain you might see on an FTC robot.',
      hint: 'Use the name of the drivetrain type.',
      answers: [
        { text: 'Mecanum', aliases: ['Mecanum drive'], tierId: '1' },
        { text: 'Tank drive', aliases: ['Tank', 'Differential drive'], tierId: '2' },
        { text: 'X-drive', aliases: ['X drive', 'Omni X drive'], tierId: '3' },
        { text: 'Swerve drive', aliases: ['Swerve'], tierId: '4' },
        { text: 'Kiwi drive', aliases: ['Kiwi', 'Three-wheel omni drive'], tierId: '5' },
      ],
    },
    {
      id: 'practice-sensing',
      prompt: 'Name a sensor an FTC robot can use to tell what is happening around it.',
      hint: 'Give a type of sensor or a common name for it.',
      answers: [
        { text: 'Color sensor', aliases: ['Colour sensor'], tierId: '1' },
        { text: 'Distance sensor', aliases: ['Range sensor', 'Time of flight sensor', 'ToF sensor'], tierId: '2' },
        { text: 'Camera', aliases: ['Webcam', 'Vision camera'], tierId: '3' },
        { text: 'Touch sensor', aliases: ['Limit switch', 'Bumper switch'], tierId: '4' },
        { text: 'Magnetic sensor', aliases: ['Hall effect sensor', 'Hall sensor'], tierId: '5' },
      ],
    },
  ],
};
