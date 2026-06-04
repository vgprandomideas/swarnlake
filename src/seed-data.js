function createAgeCategory(id, label, minAge, maxAge) {
  return {
    id,
    label,
    minAge,
    maxAge
  };
}

function createEvent({
  id,
  name,
  category,
  eventDate,
  dateLabel = "",
  dayLabel = "",
  timeLabel = "",
  closeAt,
  weekLabel,
  fee = 50,
  venue = "Purva Swanlake Apartments",
  format = "Individual",
  enabled = true,
  description = "",
  notes = "",
  categoryLabels = [],
  posterAccent = "blue",
  allowedAgeCategoryIds = [],
  allowedParticipantTypes = ["child", "adult"]
}) {
  return {
    id,
    name,
    category,
    eventDate,
    dateLabel,
    dayLabel,
    timeLabel,
    closeAt,
    weekLabel,
    fee,
    venue,
    format,
    enabled,
    description,
    notes,
    categoryLabels,
    posterAccent,
    allowedAgeCategoryIds,
    allowedParticipantTypes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createSeedData({ adminUsername, adminPasswordHash } = {}) {
  const now = new Date().toISOString();

  return {
    meta: {
      appName: "Purva Play Fest 2026",
      shortName: "PPF'26",
      venue: "Purva Swanlake Apartments",
      updatedAt: now,
      launchedAt: "2026-06-01T00:00:00.000Z"
    },
    settings: {
      registrationStartDate: "2026-06-01",
      supportEmail: "sportsclub@purvaswanlake.local",
      supportPhone: "+91 90000 00000",
      contactName: "Purva Swanlake Sports Committee",
      defaultFee: 50,
      liveCountEnabled: true,
      payment: {
        mode: "manual_upi",
        gatewayProvider: "Razorpay",
        gatewayEnabled: false,
        gatewayLabel: "Online checkout can be enabled once committee credentials are added.",
        upiPayeeName: "Purva Swanlake Sports Club",
        upiId: "ppf26@upi",
        gpayNumber: "+91 90000 00000",
        qrImagePath: "",
        note: "Please mention your flat number in the payment remarks before uploading proof."
      },
      adminUsers: [
        {
          id: "committee-admin",
          username: adminUsername,
          passwordHash: adminPasswordHash,
          fullName: "Sports Committee Admin",
          role: "super_admin"
        }
      ]
    },
    ageCategories: [
      createAgeCategory("under-5", "Under 5", 0, 5),
      createAgeCategory("6-10", "6-10", 6, 10),
      createAgeCategory("11-15", "11-15", 11, 15),
      createAgeCategory("16-25", "16-25", 16, 25),
      createAgeCategory("26-50", "26-50", 26, 50),
      createAgeCategory("senior", "Senior", 51, null)
    ],
    events: [
      createEvent({
        id: "table-tennis",
        name: "Table Tennis",
        category: "Indoor Racquet Sport",
        eventDate: "2026-06-13",
        dateLabel: "June 13, 2026",
        dayLabel: "Saturday",
        timeLabel: "4:00 PM",
        closeAt: "2026-06-11T23:59:59.000Z",
        weekLabel: "Opening Weekend",
        format: "Singles",
        description: "Fast opening-weekend table tennis clashes to kick off the festival.",
        categoryLabels: ["Men's/Boys", "Women's/Girls"],
        posterAccent: "red",
        allowedAgeCategoryIds: ["6-10", "11-15", "16-25", "26-50", "senior"],
        allowedParticipantTypes: ["child", "adult"]
      }),
      createEvent({
        id: "swimming",
        name: "Swimming",
        category: "Aquatics",
        eventDate: "2026-06-14",
        dateLabel: "June 14, 2026",
        dayLabel: "Sunday",
        timeLabel: "3:00 PM",
        closeAt: "2026-06-11T23:59:59.000Z",
        weekLabel: "Opening Weekend",
        description: "Pool racing for residents across boys, girls, men, and women divisions.",
        categoryLabels: ["Men's/Boys", "Women's/Girls"],
        posterAccent: "blue",
        allowedAgeCategoryIds: ["6-10", "11-15", "16-25", "26-50", "senior"],
        allowedParticipantTypes: ["child", "adult"]
      }),
      createEvent({
        id: "basketball",
        name: "Basketball",
        category: "Court Sport",
        eventDate: "2026-06-20",
        dateLabel: "June 20, 2026",
        dayLabel: "Saturday",
        timeLabel: "4:00 PM",
        closeAt: "2026-06-18T23:59:59.000Z",
        weekLabel: "Week 2",
        format: "Team",
        description: "High-energy half-court action for school-age players and youth teams.",
        categoryLabels: ["Boys", "Girls"],
        posterAccent: "orange",
        allowedAgeCategoryIds: ["6-10", "11-15", "16-25"],
        allowedParticipantTypes: ["child", "adult"]
      }),
      createEvent({
        id: "chess",
        name: "Chess",
        category: "Mind Sport",
        eventDate: "2026-06-21",
        dateLabel: "June 21, 2026",
        dayLabel: "Sunday",
        timeLabel: "10:00 AM",
        closeAt: "2026-06-18T23:59:59.000Z",
        weekLabel: "Week 2",
        description: "A strategic morning bracket where calm thinking and patience matter.",
        categoryLabels: ["Men's/Boys", "Women's/Girls"],
        posterAccent: "purple",
        allowedAgeCategoryIds: ["6-10", "11-15", "16-25", "26-50", "senior"],
        allowedParticipantTypes: ["child", "adult"]
      }),
      createEvent({
        id: "throw-ball",
        name: "Throw Ball",
        category: "Court Team Sport",
        eventDate: "2026-06-21",
        dateLabel: "June 21, 2026",
        dayLabel: "Sunday",
        timeLabel: "4:00 PM",
        closeAt: "2026-06-18T23:59:59.000Z",
        weekLabel: "Week 2",
        format: "Team",
        description: "An evening showcase match dedicated to girls and women players.",
        categoryLabels: ["Girls/Women"],
        posterAccent: "green",
        allowedAgeCategoryIds: ["11-15", "16-25", "26-50", "senior"],
        allowedParticipantTypes: ["child", "adult"]
      }),
      createEvent({
        id: "carrom",
        name: "Carrom",
        category: "Indoor Board Game",
        eventDate: "2026-06-28",
        dateLabel: "June 28, 2026",
        dayLabel: "Sunday",
        timeLabel: "9:00 AM",
        closeAt: "2026-06-25T23:59:59.000Z",
        weekLabel: "Week 3",
        description: "Classic carrom boards, careful angles, and close family rivalries.",
        categoryLabels: ["Men's", "Women's"],
        posterAccent: "gold",
        allowedAgeCategoryIds: ["11-15", "16-25", "26-50", "senior"],
        allowedParticipantTypes: ["adult"]
      }),
      createEvent({
        id: "volleyball",
        name: "Volleyball",
        category: "Net Team Sport",
        eventDate: "2026-07-05",
        dateLabel: "July 5, 2026",
        dayLabel: "Sunday",
        timeLabel: "4:00 PM",
        closeAt: "2026-07-02T23:59:59.000Z",
        weekLabel: "Week 4",
        format: "Team",
        description: "Men's volleyball with big serves, blocks, and rooftop cheers.",
        categoryLabels: ["Men's"],
        posterAccent: "blue",
        allowedAgeCategoryIds: ["16-25", "26-50", "senior"],
        allowedParticipantTypes: ["adult"]
      }),
      createEvent({
        id: "football",
        name: "Football",
        category: "Field Team Sport",
        eventDate: "2026-07-12",
        dateLabel: "July 12, 2026",
        dayLabel: "Sunday",
        timeLabel: "3:00 PM",
        closeAt: "2026-07-09T23:59:59.000Z",
        weekLabel: "Week 5",
        format: "Team",
        description: "A headline field-sport clash for men's and boys squads.",
        categoryLabels: ["Men's", "Boys"],
        posterAccent: "green",
        allowedAgeCategoryIds: ["11-15", "16-25", "26-50", "senior"],
        allowedParticipantTypes: ["child", "adult"]
      }),
      createEvent({
        id: "tennis",
        name: "Tennis",
        category: "Outdoor Racquet Sport",
        eventDate: "2026-07-18",
        dateLabel: "July 18-19, 2026",
        dayLabel: "Saturday & Sunday",
        timeLabel: "6:00 PM",
        closeAt: "2026-07-16T23:59:59.000Z",
        weekLabel: "Week 6",
        description: "A weekend tennis draw for men's and women's brackets under lights.",
        categoryLabels: ["Men's", "Women's"],
        posterAccent: "lime",
        allowedAgeCategoryIds: ["16-25", "26-50", "senior"],
        allowedParticipantTypes: ["adult"]
      }),
      createEvent({
        id: "gully-cricket",
        name: "Gully Cricket",
        category: "Street Cricket",
        eventDate: "2026-08-01",
        dateLabel: "August 1-2, 2026",
        dayLabel: "Saturday & Sunday",
        timeLabel: "3:00 PM",
        closeAt: "2026-07-30T23:59:59.000Z",
        weekLabel: "Grand Finale",
        format: "Team",
        description: "The closing-weekend neighborhood favorite with open-category bragging rights.",
        categoryLabels: ["Open Category"],
        posterAccent: "orange",
        allowedAgeCategoryIds: ["under-5", "6-10", "11-15", "16-25", "26-50", "senior"],
        allowedParticipantTypes: ["child", "adult"]
      })
    ],
    registrations: [],
    sessions: []
  };
}
