import { builder } from "~/graphql/builder";

builder.mutationField("createTeam", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      name: t.arg.string({ required: true }),
      eventId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");
      if (user.role === "USER" || user.role === "JUDGE" || user.role === "JURY")
        throw new Error("Not authorized");

      const event = await ctx.prisma.event.findUnique({
        where: {
          id: Number(args.eventId),
        },
      });
      if (!event) throw new Error("Event not found");

      if (
        event.eventType === "INDIVIDUAL" ||
        event.eventType === "INDIVIDUAL_MULTIPLE_ENTRY"
      )
        throw new Error("Event is individual");

      if (event.eventType === "TEAM") {
        const registeredTeam = await ctx.prisma.team.findMany({
          where: {
            eventId: Number(args.eventId),
            TeamMembers: {
              some: {
                userId: user.id,
              },
            },
          },
        });
        if (registeredTeam.length > 0) throw new Error("Already registered");
      }

      if (event.maxTeams && event.maxTeams > 0) {
        const totalTeams = await ctx.prisma.team.count({
          where: {
            eventId: Number(args.eventId),
            confirmed: true,
          },
        });
        if (event.maxTeams && totalTeams >= event.maxTeams)
          throw new Error("Event is full");
      }

      const team = await ctx.prisma.team.findUnique({
        where: {
          name_eventId: {
            name: args.name,
            eventId: Number(args.eventId),
          },
        },
        include: {
          TeamMembers: true,
        },
      });
      if (team) throw new Error("Team name already exists");

      try {
        return await ctx.prisma.team.create({
          data: {
            name: args.name,
            eventId: Number(args.eventId),
            TeamMembers: {
              create: {
                userId: user.id,
              },
            },
            leaderId: user.id,
            confirmed: false,
          },
          ...query,
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't create team");
      }
    },
  }),
);

builder.mutationField("joinTeam", (t) =>
  t.prismaField({
    type: "TeamMember",
    args: {
      teamId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role === "USER" || user.role === "JUDGE" || user.role === "JURY")
        throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          TeamMembers: {
            select: {
              User: {
                select: {
                  College: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!team) throw new Error("Team not found");

      if (team.confirmed) throw new Error("Can't Join team, Team is confirmed");

      const event = await ctx.prisma.event.findUnique({
        where: {
          id: team.eventId,
        },
      });
      if (!event) throw new Error("Event not found");

      if (
        event.eventType === "INDIVIDUAL" ||
        event.eventType === "INDIVIDUAL_MULTIPLE_ENTRY"
      )
        throw new Error("Event is individual");

      if (event.eventType === "TEAM") {
        const registeredTeam = await ctx.prisma.team.findMany({
          where: {
            eventId: Number(event.id),
            TeamMembers: {
              some: {
                userId: user.id,
              },
            },
          },
        });
        if (registeredTeam.length > 0) throw new Error("Already registered");
      }

      const teamMembers = await ctx.prisma.teamMember.findMany({
        where: {
          teamId: Number(args.teamId),
        },
      });
      if (teamMembers.length >= event.maxTeamSize)
        throw new Error("Team is full");

      const leader = await ctx.prisma.user.findUnique({
        where: {
          id: Number(team.leaderId),
        },
      });
      const ignore = [27, 50, 52, 53, 54, 56];
      if (user.collegeId !== leader?.collegeId && !ignore.includes(event.id))
        throw new Error("Team members should belong to same college");

      try {
        return await ctx.prisma.teamMember.create({
          data: {
            teamId: Number(args.teamId),
            userId: user.id,
          },
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't join team");
      }
    },
  }),
);

builder.mutationField("leaveTeam", (t) =>
  t.prismaField({
    type: "TeamMember",
    args: {
      teamId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role === "USER" || user.role === "JUDGE" || user.role === "JURY")
        throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          TeamMembers: true,
        },
      });
      if (!team) throw new Error("Team not found");

      if (
        team.TeamMembers.find((member) => member.userId === user.id) ===
        undefined
      )
        throw new Error("Not a member of team");

      if (team.confirmed) throw new Error("Team is confirmed");

      try {
        return await ctx.prisma.teamMember.delete({
          where: {
            userId_teamId: {
              userId: user.id,
              teamId: Number(args.teamId),
            },
          },
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't leave team");
      }
    },
  }),
);

builder.mutationField("confirmTeam", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      teamId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role === "USER" || user.role === "JUDGE" || user.role === "JURY")
        throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
      });
      if (!team) throw new Error("Team not found");

      if (team.leaderId !== user.id)
        throw new Error("Not authorized only leader can confirm team");

      const event = await ctx.prisma.event.findUnique({
        where: {
          id: team.eventId,
        },
      });
      if (!event) throw new Error("Event not found");

      if (event.eventType === "INDIVIDUAL")
        throw new Error("Event is individual");

      if (event.maxTeams && event.maxTeams > 0) {
        const totalTeams = await ctx.prisma.team.count({
          where: {
            eventId: event.id,
            confirmed: true,
          },
        });
        if (event.maxTeams && totalTeams >= event.maxTeams)
          throw new Error("Event is full");
      }
      const isPaidEvent = event.fees > 0;
      if (isPaidEvent) throw new Error("Event is paid");

      // check if user is leader of team
      const teamMembers = await ctx.prisma.teamMember.findMany({
        where: {
          teamId: Number(args.teamId),
        },
      });

      if (teamMembers.length < event.minTeamSize)
        throw new Error(
          `Team is not full need at least ${event.minTeamSize} members`,
        );

      try {
        return await ctx.prisma.team.update({
          where: {
            id: Number(args.teamId),
          },
          data: {
            confirmed: true,
          },
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't confirm team");
      }
    },
  }),
);

builder.mutationField("deleteTeam", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      teamId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role === "USER" || user.role === "JUDGE" || user.role === "JURY")
        throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
      });
      if (!team) throw new Error("Team not found");

      if (team.leaderId !== user.id)
        throw new Error("Not authorized only leader can delete team");

      if (team.confirmed) throw new Error("Team is confirmed");

      const event = await ctx.prisma.event.findUnique({
        where: {
          id: team.eventId,
        },
      });
      if (!event) throw new Error("Event not found");

      try {
        return await ctx.prisma.team.delete({
          where: {
            id: Number(args.teamId),
          },
          ...query,
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't delete team");
      }
    },
  }),
);

builder.mutationField("removeTeamMember", (t) =>
  t.prismaField({
    type: "TeamMember",
    args: {
      teamId: t.arg.id({ required: true }),
      userId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          TeamMembers: true,
        },
      });
      if (!team) throw new Error("Team not found");

      if (
        !team.TeamMembers.find(
          (member) => member.userId === Number(args.userId),
        )
      )
        throw new Error("User does not belong to this team");

      if (!team.leaderId) throw new Error("The leader does not exist");
      else if (team.leaderId !== user.id)
        throw new Error("Action allowed only for the leader");

      try {
        return await ctx.prisma.teamMember.delete({
          where: {
            userId_teamId: {
              userId: Number(args.userId),
              teamId: Number(args.teamId),
            },
          },
          ...query,
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't remove team member");
      }
    },
  }),
);

// Solo Events
builder.mutationField("registerSoloEvent", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      eventId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role === "USER" || user.role === "JUDGE" || user.role === "JURY")
        throw new Error("Not authorized");

      const event = await ctx.prisma.event.findUnique({
        where: {
          id: Number(args.eventId),
        },
      });
      if (!event) throw new Error("Event not found");

      if (event.eventType === "TEAM") throw new Error("Event is team");

      const isPaidEvent = event.fees > 0;
      if (event.eventType === "INDIVIDUAL") {
        const registeredTeam = await ctx.prisma.team.findMany({
          where: {
            eventId: Number(event.id),
            TeamMembers: {
              some: {
                userId: user.id,
              },
            },
          },
        });
        if (registeredTeam.length > 0) throw new Error("Already registered");
      }

      try {
        return await ctx.prisma.team.create({
          data: {
            name: user.id.toString(),
            eventId: Number(args.eventId),
            leaderId: user.id,
            confirmed: !isPaidEvent,
            TeamMembers: {
              create: {
                userId: user.id,
              },
            },
          },
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't register for event");
      }
    },
  }),
);

// organizer
// organizers can createTeam and add members to team and confirm team and delete team and delete team members

// mutations for organizer
// createTeam
// addTeamMember
// deleteTeam
// deleteTeamMember

builder.mutationField("organizerCreateTeam", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      eventId: t.arg.id({ required: true }),
      name: t.arg.string({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "ORGANIZER") throw new Error("Not authorized");

      const event = await ctx.prisma.event.findUnique({
        where: {
          id: Number(args.eventId),
        },
        include: {
          Organizers: true,
        },
      });
      if (!event) throw new Error("Event not found");

      if (event.Organizers.filter((org) => org.userId === user.id).length === 0)
        throw new Error("Not authorized");

      try {
        return await ctx.prisma.team.create({
          data: {
            name: args.name,
            eventId: Number(args.eventId),
            confirmed: true,
          },
        });
      } catch (e) {
        console.log(e);
        throw new Error("Team already exists");
      }
    },
  }),
);

builder.mutationField("organizerDeleteTeam", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      teamId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "ORGANIZER") throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          Event: {
            include: {
              Organizers: true,
            },
          },
        },
      });
      if (!team) throw new Error("Team not found");

      if (
        team.Event.Organizers.filter((org) => org.userId === user.id).length ===
        0
      )
        throw new Error("Not authorized");

      try {
        return await ctx.prisma.team.delete({
          where: {
            id: Number(args.teamId),
          },
          ...query,
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't delete team");
      }
    },
  }),
);

builder.mutationField("organizerAddTeamMember", (t) =>
  t.prismaField({
    type: "TeamMember",
    args: {
      teamId: t.arg.id({ required: true }),
      userId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "ORGANIZER") throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          Event: {
            include: {
              Organizers: true,
            },
          },
        },
      });
      if (!team) throw new Error("Team not found");

      const participant = await ctx.prisma.user.findUnique({
        where: {
          id: Number(args.userId),
        },
        include: {
          College: true,
        },
      });
      if (
        !participant ||
        participant.role === "USER" ||
        participant.role === "JUDGE"
      )
        throw new Error(`No participant with id ${args.userId}`);

      if (
        team.Event.Organizers.filter((org) => org.userId === user.id).length ===
        0
      )
        throw new Error("Not authorized");

      const teamMembers = await ctx.prisma.teamMember.findMany({
        where: {
          teamId: Number(args.teamId),
        },
      });
      if (teamMembers.length >= team.Event.maxTeamSize)
        throw new Error("Team is full");

      if (team.Event.eventType === "TEAM") {
        const registeredTeam = await ctx.prisma.team.findMany({
          where: {
            eventId: Number(team.Event.id),
            TeamMembers: {
              some: {
                userId: user.id,
              },
            },
          },
        });
        if (registeredTeam.length > 0) throw new Error("Already registered");
      }

      if (teamMembers.length !== 0) {
        const leader = await ctx.prisma.user.findUnique({
          where: {
            id: Number(team.leaderId),
          },
          include: {
            College: true,
          },
        });
        const ignore = [27, 50, 52, 53, 54, 56];
        if (
          participant.College.id !== leader?.College.id &&
          !ignore.includes(team.Event.id)
        )
          throw new Error("Team members should belong to same college");
      }

      if (teamMembers.length === 0)
        await ctx.prisma.team.update({
          where: {
            id: Number(args.teamId),
          },
          data: {
            leaderId: participant.id,
          },
        });

      try {
        return await ctx.prisma.teamMember.create({
          data: {
            userId: participant.id,
            teamId: Number(args.teamId),
          },
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't add team member");
      }
    },
  }),
);

builder.mutationField("organizerDeleteTeamMember", (t) =>
  t.prismaField({
    type: "TeamMember",
    args: {
      teamId: t.arg.id({ required: true }),
      userId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "ORGANIZER") throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          Event: {
            include: {
              Organizers: true,
            },
          },
        },
      });
      if (!team) throw new Error("Team not found");

      if (
        team.Event.Organizers.filter((org) => org.userId === user.id).length ===
        0
      )
        throw new Error("Not authorized");

      try {
        return await ctx.prisma.teamMember.delete({
          where: {
            userId_teamId: {
              userId: Number(args.userId),
              teamId: Number(args.teamId),
            },
          },
          ...query,
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't delete team member");
      }
    },
  }),
);

// mark attendance for team
builder.mutationField("organizerMarkAttendance", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      teamId: t.arg.id({ required: true }),
      attended: t.arg.boolean({ required: true, defaultValue: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "ORGANIZER") throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          Event: {
            include: {
              Organizers: true,
            },
          },
          TeamMembers: true,
        },
      });
      if (!team) throw new Error("Team not found");

      if (
        team.Event.Organizers.filter((org) => org.userId === user.id).length ===
        0
      )
        throw new Error("Not authorized");

      // get all userIds from team
      const teamMembers = team.TeamMembers.map((member) => member.userId);
      if (args.attended) {
        // give xp for attedning event
        const level = await ctx.prisma.level.findFirst({
          where: {
            EventId: team.eventId,
          },
        });
        if (!level) {
          const points = team.Event.category === "CORE" ? 50 : 30;
          // create level if not exists
          const newLevel = await ctx.prisma.level.create({
            data: {
              point: points,
              Event: {
                connect: {
                  id: team.eventId,
                },
              },
            },
          });
          // give xp to all team members
          await ctx.prisma.xP.createMany({
            data: teamMembers.map((userId) => ({
              userId,
              levelId: newLevel.id,
            })),
          });
        } else {
          //check if level points is given to all team members
          const users = await ctx.prisma.xP.findMany({
            where: {
              userId: {
                in: teamMembers,
              },
              levelId: level.id,
            },
          });
          if (users.length == 0) {
            // give xp to all team members
            await ctx.prisma.xP.createMany({
              data: teamMembers.map((userId) => ({
                userId,
                levelId: level.id,
              })),
            });
          }
        }
      } else {
        // remove xp for attedning event
        const level = await ctx.prisma.level.findFirst({
          where: {
            EventId: team.eventId,
          },
        });
        if (level) {
          // remove xp to all team members
          await ctx.prisma.xP.deleteMany({
            where: {
              userId: {
                in: teamMembers,
              },
              levelId: level.id,
            },
          });
        }
      }

      try {
        return await ctx.prisma.team.update({
          where: {
            id: Number(args.teamId),
          },
          data: {
            attended: args.attended,
          },
          ...query,
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't mark attendance");
      }
    },
  }),
);

// mark attendance for solo events
builder.mutationField("organizerMarkAttendanceSolo", (t) =>
  t.field({
    type: "Int",
    args: {
      eventId: t.arg.id({ required: true }),
      userId: t.arg.id({ required: true }),
      attended: t.arg.boolean({ required: true, defaultValue: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "ORGANIZER") throw new Error("Not authorized");

      const event = await ctx.prisma.event.findFirst({
        where: {
          AND: [
            {
              id: Number(args.eventId),
            },
            {
              Organizers: {
                some: {
                  userId: user.id,
                },
              },
            },
          ],
        },
      });
      if (!event) throw new Error("Event not found");

      const participant = await ctx.prisma.user.findUnique({
        where: {
          id: Number(args.userId),
        },
      });
      if (
        !participant ||
        participant.role === "USER" ||
        participant.role === "JUDGE"
      )
        throw new Error(`No participant with id ${args.userId}`);

      const updated = await ctx.prisma.team.updateMany({
        where: {
          TeamMembers: {
            some: {
              userId: participant.id,
            },
          },
        },
        data: {
          attended: args.attended,
        },
      });
      if (updated.count === 0) throw new Error("No team found");

      if (args.attended) {
        // give xp for attedning event
        const level = await ctx.prisma.level.findFirst({
          where: {
            EventId: Number(args.eventId),
          },
        });
        if (!level) {
          const points = event.category === "CORE" ? 50 : 30;
          // create level if not exists
          const newLevel = await ctx.prisma.level.create({
            data: {
              point: points,
              Event: {
                connect: {
                  id: Number(args.eventId),
                },
              },
            },
          });
          // give xp to all team members
          await ctx.prisma.xP.create({
            data: {
              userId: Number(args.userId),
              levelId: newLevel.id,
            },
          });
        } else {
          //check if level points is given to all team members
          const users = await ctx.prisma.xP.findFirst({
            where: {
              userId: Number(args.userId),
              levelId: level.id,
            },
          });
          if (!users)
            // give xp to all team members
            await ctx.prisma.xP.create({
              data: {
                userId: Number(args.userId),
                levelId: level.id,
              },
            });
        }
      } else {
        // remove xp for attedning event
        const level = await ctx.prisma.level.findFirst({
          where: {
            EventId: Number(args.eventId),
          },
        });
        if (level)
          // remove xp to all team members
          await ctx.prisma.xP.deleteMany({
            where: {
              userId: Number(args.userId),
              levelId: level.id,
            },
          });
      }
      return updated.count;
    },
  }),
);

builder.mutationField("organizerRegisterSolo", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      eventId: t.arg.id({ required: true }),
      userId: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "ORGANIZER") throw new Error("Not authorized");

      const event = await ctx.prisma.event.findFirst({
        where: {
          AND: [
            {
              id: Number(args.eventId),
            },
            {
              Organizers: {
                some: {
                  userId: user.id,
                },
              },
            },
          ],
        },
      });
      if (!event) throw new Error("Event not found");

      if (
        event.eventType === "TEAM" ||
        event.eventType === "TEAM_MULTIPLE_ENTRY"
      )
        throw new Error("Team Event");

      const participant = await ctx.prisma.user.findUnique({
        where: {
          id: Number(args.userId),
        },
        include: {
          College: true,
        },
      });
      if (
        !participant ||
        participant.role === "USER" ||
        participant.role === "JUDGE"
      )
        throw new Error(`No participant with id ${args.userId}`);

      if (event.eventType === "INDIVIDUAL") {
        const registered = await ctx.prisma.team.findMany({
          where: {
            AND: [
              {
                eventId: event.id,
              },
              {
                TeamMembers: {
                  some: {
                    userId: Number(args.userId),
                  },
                },
              },
            ],
          },
        });
        if (registered.length > 0)
          throw new Error("Participant already registered");
      }

      try {
        return await ctx.prisma.team.create({
          data: {
            eventId: Number(args.eventId),
            name: args.userId,
            attended: true,
            confirmed: true,
            leaderId: Number(args.userId),
            TeamMembers: {
              create: {
                userId: Number(args.userId),
              },
            },
          },
          ...query,
        });
      } catch (e) {
        console.log(e);
        throw new Error("Something went wrong! Couldn't register for event");
      }
    },
  }),
);

builder.mutationField("promoteToNextRound", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      teamId: t.arg.id({ required: true }),
      selected: t.arg.boolean({ required: true, defaultValue: true }),
      roundNo: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "JUDGE") throw new Error("Not authorized");

      const team = await ctx.prisma.team.findUnique({
        where: {
          id: Number(args.teamId),
        },
        include: {
          Event: {
            include: {
              Rounds: true,
            },
          },
        },
      });

      if (!team) throw new Error("Team not found");

      const round = await ctx.prisma.round.findUnique({
        where: {
          eventId_roundNo: {
            eventId: team.Event.id,
            roundNo: Number(args.roundNo),
          },
        },
        include: {
          Judges: true,
        },
      });
      if (!round) throw new Error("Round not found");

      if (round.completed) throw new Error("Round completed");

      if (round.Judges.filter((judge) => judge.userId === user.id).length === 0)
        throw new Error("Not authorized");

      if (
        team.Event.Rounds.length <= Number(args.roundNo) ||
        Number(args.roundNo) <= 0
      )
        throw new Error("Invalid round number");

      let roundNo = team.roundNo;

      if (args.selected && team.roundNo === Number(args.roundNo))
        roundNo = Number(args.roundNo) + 1;
      else if (!args.selected && team.roundNo === Number(args.roundNo) + 1)
        roundNo = Number(args.roundNo);

      try {
        const data = await ctx.prisma.team.update({
          where: {
            id: Number(args.teamId),
          },
          data: {
            roundNo,
          },
          ...query,
        });

        return data;
      } catch (e) {
        console.log(e);
        throw new Error(
          "Something went wrong! Couldn't promote team to next round",
        );
      }
    },
  }),
);

builder.mutationField("completeRoadiesRound", (t) =>
  t.prismaField({
    type: ["Team"],
    args: {
      eventId: t.arg.id({ required: true }),
      roundNo: t.arg.id({ required: true }),
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not authenticated");

      if (user.role !== "JUDGE") throw new Error("Not authorized");

      try {
        return await ctx.prisma.$transaction(async (db) => {
          const nextRound = Number(args.roundNo) + 1;
          const teams = await db.team.findMany({
            where: {
              eventId: Number(args.eventId),
              roundNo: nextRound,
              confirmed: true,
            },
            include: {
              TeamMembers: {
                select: {
                  userId: true,
                  teamId: true,
                },
              },
            },
          });

          const updatedTeams = [];

          for (const team of teams) {
            if (team.TeamMembers.length < 2)
              throw new Error("Not enough members to split");

            const leader = team.TeamMembers.find(
              (member) => member.userId === team.leaderId,
            );
            if (!leader) throw new Error("Leader not found");

            // Rename original team
            const updatedTeam = await db.team.update({
              where: { id: team.id },
              data: { name: `${team.name}-1` },
              ...query,
            });

            // make the non-leader ; leader of new team
            const newLeader = team.TeamMembers.find(
              (member) =>
                member.userId !== team.leaderId && member.teamId === team.id,
            );
            if (!newLeader) throw new Error("New leader not found");

            // Create new team
            const newTeam = await db.team.create({
              data: {
                name: `${team.name}-2`,
                eventId: team.eventId,
                roundNo: team.roundNo,
                leaderId: newLeader.userId,
                attended: team.attended,
                confirmed: team.confirmed,
                TeamMembers: {
                  create: {
                    userId: newLeader.userId,
                  },
                },
              },
            });

            updatedTeams.push(updatedTeam, newTeam);

            //delete the team-member from the original team
            await db.teamMember.deleteMany({
              where: {
                teamId: team.id,
                userId: {
                  not: team.leaderId ?? 0,
                },
              },
            });
          }

          const round = await ctx.prisma.round.findUnique({
            where: {
              eventId_roundNo: {
                eventId: Number(args.eventId),
                roundNo: Number(args.roundNo),
              },
            },
            include: {
              Judges: true,
            },
          });
          if (!round) throw new Error("Round not found");

          const judge = round.Judges.find((j) => j.userId === user.id);
          if (!judge) throw new Error("Not authorized");

          try {
            await ctx.prisma.round.update({
              where: {
                eventId_roundNo: {
                  eventId: Number(args.eventId),
                  roundNo: Number(args.roundNo),
                },
              },
              data: {
                completed: true,
              },
            });
          } catch (e) {
            console.log(e);
            throw new Error("Something went wrong! Couldn't complete round");
          }

          return updatedTeams;
        });
      } catch (error) {
        console.log(error);
        throw new Error("Something went wrong! Couldn't split team");
      }
    },
  }),
);
