export type SurgicalProtocol = {
    id: string;
    name: string;
    labels: string[];
};

// Application-level label presets. CVAT stores them as task labels and
// annotates them with its own tools.
export const SURGICAL_PROTOCOLS: SurgicalProtocol[] = [
    {
        id: "cholecystectomy",
        name: "Laparoscopic cholecystectomy",
        labels: [
            "Grasper",
            "Scissors",
            "Hook cautery",
            "Clip applier",
            "Suction",
            "Liver",
            "Gallbladder",
            "Cystic duct",
            "Cystic artery",
            "Clip",
        ],
    },
    {
        id: "instruments",
        name: "General instruments",
        labels: ["Grasper", "Scissors", "Needle holder", "Electrocautery", "Suction", "Clip applier", "Trocar"],
    },
    {
        id: "custom",
        name: "Custom labels",
        labels: [],
    },
];
